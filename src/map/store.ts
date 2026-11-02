import { reactive, watch } from 'vue';
import map from 'virtual:atlas-map';
import functionData from 'virtual:atlas-functions';
import processData from 'virtual:atlas-process';
import tableData from 'virtual:atlas-tables';
import type { BusinessObject, Relation } from '../model';

export type Source = 'page' | 'quick' | 'ext' | 'unused';
export interface Fn {
  name: string; group: string; kind: string; kindName: string; http: string; method: string; file: string; line: number;
  /** 谁在用：管理页面 / 给其他功能的快速接口 / 外部对接 / 前端没找到调用 */
  source?: Source; callers?: string[];
}
export interface Module { name: string; fns: Fn[]; kinds: string[] }
export type Tab = '' | 'functions' | 'relations' | 'tables' | 'code';
export type View = 'map' | 'process';

/** 流程图：一个节点就是一个功能（具体操作），连线是功能之间的先后 */
export interface TableUse { name: string; tableName?: string; why?: string }
export interface ProcPre { op: string; optional?: boolean; note?: string }
export interface ProcOp {
  objectId: string; name: string; action?: string; page?: string;
  /** 指向功能清单里这个对象的某个功能，按给出的字段全部相等来匹配 */
  fn?: Partial<Pick<Fn, 'http' | 'method' | 'group' | 'name'>>;
  pre: ProcPre[];
  /** 操作前要先选的上级，比如新增分馆要先选图书馆 */
  picks: { objectId: string; label: string }[];
  writes: TableUse[];
  province?: { mode: 'sync' | 'manual' | 'none'; text: string };
  extras?: string[]; evidence?: { file: string; line: number }[];
  confidence: 'confirmed' | 'inferred';
}
export interface ProcModule { id: string; name: string; ops: string[] }
export interface Process { modules: ProcModule[]; ops: Record<string, ProcOp>; provinceLabel?: string }
export interface OpenOpts { module?: string; tab?: Tab; source?: Source; op?: number; from?: 'relation' }

export { map };
export const kindOrder = ['查询', '新增', '编辑', '删除', '审批', '状态变更', '导入', '导出', '上报同步', '其他'];
/** 不在约定动作类型里的统一并入「其他」，免得分组时丢掉 */
export const functions: Record<string, Fn[]> = Object.fromEntries(Object.entries(functionData as Record<string, Fn[]>)
  .map(([id, fns]) => [id, fns.map(f => (kindOrder.includes(f.kindName) ? f : { ...f, kindName: '其他' }))]));
export const objById = new Map(map.objects.map(o => [o.id, o]));
export const tableById = new Map(map.tables.map(t => [t.id, t]));

/** 表字段（可选数据）：ref 指向表目录里的表（tableId）或目录外的表（tableName）；guess 表示按列名推断 */
export interface Column {
  name: string; type: string; comment?: string; pk?: boolean; required?: boolean;
  ref?: { tableId?: string; tableName?: string; guess?: boolean };
}
export interface TableDef { columns: Column[]; from?: string }
export const tableCols: Record<string, TableDef> = tableData;
/** 表归谁：优先主表角色 */
export const ownerOfTable = new Map<string, string>();
map.objects.forEach(o => o.tableRefs.forEach(r => { if (r.role === 'primary' || !ownerOfTable.has(r.tableId)) ownerOfTable.set(r.tableId, o.id); }));

/**
 * 只认直接依赖：表 A 有字段指向 B，但 A 经别的表一定能走到 B（比如馆藏册表存了图书馆ID，可馆藏册→分馆→图书馆），
 * 这个图书馆ID 只是冗余的范围字段，不算 A 直接依赖 B。
 * 「一定能走到」只走必填字段：馆藏册→书架的书架ID 可以为空，所以经书架走到的表仍算直接依赖
 */
const refEdges = new Map<string, Set<string>>(), mustEdges = new Map<string, Set<string>>();
const addEdge = (m: Map<string, Set<string>>, a: string, b: string) => { if (!m.has(a)) m.set(a, new Set()); m.get(a)!.add(b); };
Object.entries(tableCols).forEach(([tid, def]) => def.columns.forEach(c => {
  const to = c.ref?.tableId;
  if (!to || to === tid || !tableById.has(to) || !tableById.has(tid)) return;
  addEdge(refEdges, tid, to);
  if (c.required || c.pk) addEdge(mustEdges, tid, to);
}));
function reachesWithout(from: string, target: string): boolean {
  const seen = new Set([from]);
  const stack = [...(mustEdges.get(from) ?? [])].filter(n => n !== target);
  while (stack.length) {
    const n = stack.pop()!;
    if (n === target) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    mustEdges.get(n)?.forEach(m => stack.push(m));
  }
  return false;
}
const directEdge = new Set<string>();
refEdges.forEach((tos, from) => tos.forEach(to => { if (!reachesWithout(from, to)) directEdge.add(`${from}>${to}`); }));

export interface TableLink { tableId: string; via: { table: string; column: string; guess?: boolean }[] }
/** 上游：本对象的表直接依赖的别的表；下游：直接依赖本对象的表的别的表 */
export function tableLinksOf(objId: string) {
  const own = new Set(objById.get(objId)!.tableRefs.map(r => r.tableId));
  const up = new Map<string, TableLink>(), down = new Map<string, TableLink>();
  const add = (m: Map<string, TableLink>, id: string, v: TableLink['via'][number]) => {
    if (!m.has(id)) m.set(id, { tableId: id, via: [] });
    m.get(id)!.via.push(v);
  };
  Object.entries(tableCols).forEach(([tid, def]) => def.columns.forEach(c => {
    const to = c.ref?.tableId;
    if (!to || !directEdge.has(`${tid}>${to}`)) return;
    if (own.has(tid) && !own.has(to)) add(up, to, { table: tid, column: c.name, guess: c.ref!.guess });
    if (!own.has(tid) && own.has(to)) add(down, tid, { table: to, column: c.name, guess: c.ref!.guess });
  }));
  return { up: [...up.values()], down: [...down.values()] };
}

/** 只保留落在某个模块里、指向已知对象的操作，脏数据不上图 */
export const proc: Process = processData;
export const provinceLabel = proc.provinceLabel || '外部平台';
export const moduleOfOp = new Map<string, { mod: ProcModule; col: number; row: number }>();
proc.modules.forEach((mod, col) => mod.ops.forEach((id, row) => {
  if (proc.ops[id] && objById.has(proc.ops[id].objectId)) moduleOfOp.set(id, { mod, col, row });
}));
export const procOp = (id: string) => (moduleOfOp.has(id) ? proc.ops[id] : undefined);
/** 反查：谁把我当前置 */
const postEdges = new Map<string, ProcPre[]>();
moduleOfOp.forEach((_, id) => proc.ops[id].pre.forEach(p => {
  if (moduleOfOp.has(p.op)) postEdges.set(p.op, [...(postEdges.get(p.op) ?? []), { ...p, op: id }]);
}));
export const preOf = (id: string) => (procOp(id)?.pre ?? []).filter(p => moduleOfOp.has(p.op));
export const postOf = (id: string) => postEdges.get(id) ?? [];

/** 递归找全部前置 / 全部后续 */
export function chainOf(id: string, dir: 'pre' | 'post') {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of dir === 'pre' ? preOf(cur) : postOf(cur)) {
      if (p.op === id || out.has(p.op)) continue;
      out.add(p.op);
      stack.push(p.op);
    }
  }
  return out;
}
/** 按模块从左到右、模块内从上到下排序 */
export const byPlace = (a: string, b: string) => {
  const x = moduleOfOp.get(a)!, y = moduleOfOp.get(b)!;
  return x.col - y.col || x.row - y.row;
};

const matches = (f: Fn, sel: NonNullable<ProcOp['fn']>) =>
  (Object.keys(sel) as (keyof typeof sel)[]).every(k => sel[k] === undefined || f[k] === sel[k]);
/** 流程图里的操作 → 功能清单里的功能（找不到就只打开对象卡片） */
export function fnOfOp(id: string) {
  const op = procOp(id);
  if (!op?.fn || !Object.keys(op.fn).length) return undefined;
  const fn = (functions[op.objectId] ?? []).find(f => matches(f, op.fn!));
  if (!fn) return undefined;
  const source = sourceOf(fn);
  const index = modulesOf(op.objectId, source).find(m => m.name === fn.group)?.fns.indexOf(fn) ?? -1;
  return { fn, source, index };
}
/** 功能清单里的功能 → 流程图里的操作 */
export function opOfFn(objectId: string, f: Fn) {
  for (const [id] of moduleOfOp) {
    const op = proc.ops[id];
    if (op.objectId === objectId && op.fn && Object.keys(op.fn).length && matches(f, op.fn)) return id;
  }
  return '';
}

const palette = ['#5560d6', '#11896b', '#c27a10', '#b0457b', '#2f7cb8'];
export const colorOf = (domainId: string) => palette[Math.max(0, map.domains.findIndex(d => d.id === domainId)) % palette.length];
export const objColor = (id: string) => colorOf(objById.get(id)?.domainId ?? '');

const kindStyles: Record<string, { short: string; color: string }> = {
  查询: { short: '查', color: '#3b6fd8' }, 新增: { short: '增', color: '#1f9d55' }, 编辑: { short: '改', color: '#cf8a0c' },
  删除: { short: '删', color: '#d64545' }, 审批: { short: '审', color: '#0f8b8d' }, 状态变更: { short: '态', color: '#b0457b' },
  导入: { short: '入', color: '#7a5ad8' }, 导出: { short: '出', color: '#7a5ad8' },
  上报同步: { short: '报', color: '#2a9fd6' }, 其他: { short: '其', color: '#8a8f98' },
};
export const kindStyle = (k: string) => kindStyles[k] ?? kindStyles.其他;
export const provinceModes = { sync: '当场对接', manual: '另行上报', none: '不交互' } as const;

/** 图层开关：记在本机浏览器，下次打开保持 */
const defaults = { relations: true, labels: true, functions: true, tables: true, code: false, inferred: true };
function loadLayers() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('atlas.layers') || '{}') }; } catch { return { ...defaults }; }
}
export const layers = reactive<typeof defaults>(loadLayers());
watch(layers, v => { try { localStorage.setItem('atlas.layers', JSON.stringify(v)); } catch { /* 无痕模式等 */ } });

export interface TrailStop { id: string; tab: Tab; module: string; source: Source }
export const ui = reactive({
  /** 地图 / 流程图；两边共用放大的卡片和选中的流程操作 */
  view: 'map' as View,
  hover: '', focus: '', tab: 'functions' as Tab, source: 'page' as Source, module: '', op: -1,
  /** 顺着关系一路跳过来的足迹，用来回退 */
  trail: [] as TrailStop[],
  listOpen: true, query: '',
  /** 流程图：选中的操作、手动展开的模块 */
  pop: '', popen: [] as string[],
  /** 数据表页签里点开看字段的表；在弹窗里一路跳过的表，用来回上一张 */
  table: '',
  tableTrail: [] as { table: string; obj: string }[],
});
watch(() => ui.table, v => { if (!v) ui.tableTrail = []; });

/** 由画布注入：放大、后退、收起卡片 */
export const actions = {
  open: (_id: string, _opts?: OpenOpts) => {},
  back: () => {},
  close: () => {},
};

/** 像浏览器一样的后退：每次切视图、放大卡片、选模块/操作都记一笔 */
export interface Snap { view: View; focus: string; tab: Tab; module: string; source: Source; op: number; pop: string; table: string; trail: TrailStop[] }
export const snap = (): Snap => ({
  view: ui.view, focus: ui.focus, tab: ui.tab, module: ui.module, source: ui.source, op: ui.op, pop: ui.pop, table: ui.table,
  trail: ui.trail.map(s => ({ ...s })),
});
export const history = reactive<Snap[]>([]);
/** 后退按钮上写着会回到哪 */
export function snapLabel(s: Snap) {
  if (s.view === 'process') return procOp(s.pop) ? `流程图 · ${procOp(s.pop)!.name}` : '流程图';
  if (!s.focus) return '全图';
  const name = objById.get(s.focus)?.name ?? s.focus;
  return s.module ? `${name} › ${s.module}` : name;
}

/** 从流程图打开对象卡片，并定位到功能页签里对应的操作 */
export function openOp(id: string) {
  const op = procOp(id);
  if (!op) return;
  ui.pop = id;
  const hit = fnOfOp(id);
  actions.open(op.objectId, hit && hit.index >= 0 ? { tab: 'functions', source: hit.source, module: hit.fn.group, op: hit.index } : { tab: 'functions' });
}
/** 从卡片切到流程图，并选中这个操作 */
export function showOp(id: string) {
  if (!procOp(id)) return;
  ui.pop = id;
  ui.view = 'process';
}

/** 只有程序代码算代码证据；建表 SQL 在 ORM 下只是留档，AI 参考图也不算 */
export const isCode = (file: string) => !/\.(sql|json|md)$/i.test(file);

export const sourceDefs: { key: Source; name: string; hint: string }[] = [
  { key: 'page', name: '管理页面', hint: '前端页面上的操作' },
  { key: 'quick', name: '快速接口', hint: '下拉选项、编号校验等，给其他功能调用' },
  { key: 'ext', name: '扩展对接', hint: '回调、第三方平台对接等扩展进来的方法' },
  { key: 'unused', name: '未见调用', hint: '前端没找到调用处，可能给小程序、外部系统或已废弃' },
];
export const sourceOf = (f: Fn): Source => f.source ?? 'page';

export const visibleRel = (r: Relation) => layers.relations && (layers.inferred || r.confidence === 'confirmed');
export const cardinality = (c: string) => ({ '1-1': '1:1', '1-n': '1:N', 'n-n': 'N:N' }[c] ?? c);

export function neighbors(id: string) {
  const set = new Set([id]);
  map.relations.filter(visibleRel).forEach(r => {
    if (r.source === id) set.add(r.target);
    if (r.target === id) set.add(r.source);
  });
  return set;
}

export function relationsOf(id: string) {
  return map.relations.filter(r => visibleRel(r) && (r.source === id || r.target === id)).map(rel => ({
    rel, dir: rel.source === id ? 'out' as const : 'in' as const,
    other: objById.get(rel.source === id ? rel.target : rel.source) as BusinessObject,
  }));
}

export function modulesOf(id: string, source?: Source): Module[] {
  const groups = new Map<string, Fn[]>();
  (functions[id] ?? []).filter(f => !source || sourceOf(f) === source)
    .forEach(f => groups.set(f.group, [...(groups.get(f.group) ?? []), f]));
  return [...groups].map(([name, fns]) => ({
    name, fns: [...fns].sort((a, b) => kindOrder.indexOf(a.kindName) - kindOrder.indexOf(b.kindName)),
    kinds: kindOrder.filter(k => fns.some(f => f.kindName === k)),
  }));
}

/** 一个对象的「家底」：按图层开关给出功能、关系、数据表各有多少 */
export function statsOf(id: string) {
  const all: { tab: Tab; label: string; icon: string; n: number }[] = [
    { tab: 'functions', label: '功能', icon: '▦', n: layers.functions ? functions[id]?.length ?? 0 : -1 },
    { tab: 'relations', label: '关系', icon: '⟷', n: layers.relations ? relationsOf(id).length : -1 },
    { tab: 'tables', label: '数据表', icon: '⛁', n: layers.tables ? objById.get(id)?.tableRefs.length ?? 0 : -1 },
  ];
  return all.filter(s => s.n >= 0);
}

/** 当前高亮状态：放大 > 悬停 */
export function litObject(id: string): '' | 'on' | 'dim' {
  const center = ui.focus || ui.hover;
  if (!center) return '';
  return neighbors(center).has(id) ? (id === center ? 'on' : '') : 'dim';
}

export function litRelation(r: Relation): '' | 'on' | 'dim' {
  const center = ui.focus || ui.hover;
  if (!center) return '';
  return r.source === center || r.target === center ? 'on' : 'dim';
}
