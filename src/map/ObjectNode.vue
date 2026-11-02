<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import {
  actions, cardinality, chainOf, codeAt, colorOf, functions, isCode, kindOrder, kindStyle, layers, litObject, modulesOf, objById, objColor,
  opOfFn, ownerOfTable, proc, provinceLabel, provinceModes, relationsOf, showOp, sourceDefs, sourceOf, statsOf, tableById, tableCols, tableLinksOf, toggleObject, ui, isHub,
  type Fn, type Source, type Tab, type TableLink,
} from './store';

const props = defineProps<{ id: string }>();
const obj = computed(() => objById.get(props.id)!);
const color = computed(() => colorOf(obj.value.domainId));
const expanded = computed(() => ui.focus === props.id);
const state = computed(() => litObject(props.id));
const fnCount = computed(() => functions[props.id]?.length ?? 0);
const rels = computed(() => relationsOf(props.id));
const hub = isHub(props.id);
const upstream = computed(() => rels.value.filter(r => r.dir === 'in'));
const downstream = computed(() => rels.value.filter(r => r.dir === 'out'));
const tables = computed(() => obj.value.tableRefs.map(r => ({ ...tableById.get(r.tableId)!, role: r.role })));
const evidence = computed(() => [...obj.value.evidence, ...obj.value.summary.evidence]
  .filter((e, i, all) => isCode(e.file) && all.findIndex(x => codeAt(x) === codeAt(e)) === i));

const tabs = computed(() => {
  const list: { tab: Tab; label: string; icon: string; n: number }[] = statsOf(props.id).filter(s => s.n > 0);
  if (layers.code && evidence.value.length) list.push({ tab: 'code', label: '代码', icon: '</>', n: evidence.value.length });
  return list;
});
/** 当前页签被图层关掉了，就收成小卡片 */
const tab = computed<Tab>(() => (tabs.value.some(t => t.tab === ui.tab) ? ui.tab : ''));

const sources = computed(() => sourceDefs
  .map(s => ({ ...s, n: (functions[props.id] ?? []).filter(f => sourceOf(f) === s.key).length }))
  .filter(s => s.n > 0));
const source = computed<Source>(() => (sources.value.some(s => s.key === ui.source) ? ui.source : sources.value[0]?.key ?? 'page'));
const sourceHint = computed(() => sourceDefs.find(s => s.key === source.value)?.hint ?? '');
const modules = computed(() => modulesOf(props.id, source.value));
const kindsHere = computed(() => kindOrder.filter(k => modules.value.some(m => m.kinds.includes(k))));
const activeModule = computed(() => modules.value.find(m => m.name === ui.module));
const activeOp = computed(() => (ui.op >= 0 ? activeModule.value?.fns[ui.op] : undefined));
const pageCount = (callers: string[] = []) => callers.filter(c => c.startsWith('views/')).length;
/** 这个操作在流程图里：带上要选什么、存到哪、和外部平台怎么交互，以及前后各几项 */
const inProc = (f: Fn) => !!opOfFn(props.id, f);
const activeProc = computed(() => {
  const pid = activeOp.value ? opOfFn(props.id, activeOp.value) : '';
  return pid ? { id: pid, op: proc.ops[pid], pre: chainOf(pid, 'pre').size, post: chainOf(pid, 'post').size } : undefined;
});

/** 数据表：上游 / 本对象 / 下游三层，点表看字段，字段上的引用可以接着点 */
const links = computed(() => tableLinksOf(props.id));
const hasCols = Object.keys(tableCols).length > 0;
const curTable = computed(() => (ui.table ? tableById.get(ui.table) : undefined));
const curDef = computed(() => (ui.table ? tableCols[ui.table] : undefined));
const curOwner = computed(() => ownerOfTable.get(ui.table) ?? '');
const ownerColor = (tid: string) => (ownerOfTable.has(tid) ? objColor(ownerOfTable.get(tid)!) : 'var(--ink-3)');
const viaText = (l: TableLink) => l.via.map(v => `${tableById.get(v.table)?.name} 经 ${v.column}${v.guess ? '（按字段名推断）' : ''}`).join('\n');
const viaCols = (l: TableLink) => [...new Set(l.via.map(v => v.column))].join('、');
/** 卡片里点表：重新开始；弹窗里顺着引用跳：记下来处 */
function pickTable(tid: string) { ui.tableTrail = []; ui.table = ui.table === tid ? '' : tid; }
function followTable(tid: string) {
  if (tid === ui.table) return;
  ui.tableTrail.push({ table: ui.table, obj: props.id });
  ui.table = tid;
}
/** 跳到表所属的对象：卡片换过去，弹窗留着这张表 */
function openOwner(objId: string) {
  const t = ui.table, trail = [...ui.tableTrail, { table: t, obj: props.id }];
  actions.open(objId, { from: 'relation', tab: 'tables' });
  ui.table = t;
  ui.tableTrail = trail;
}
const prevTable = computed(() => ui.tableTrail[ui.tableTrail.length - 1]);
/** 同一张表只是换了卡片：写回哪个对象；换了表：写回哪张表 */
const prevLabel = computed(() => {
  const p = prevTable.value;
  if (!p) return '';
  const t = tableById.get(p.table)?.name ?? p.table;
  return p.obj !== props.id ? (p.table === ui.table ? objById.get(p.obj)!.name : `${objById.get(p.obj)!.name} · ${t}`) : t;
});
function backTable() {
  const s = ui.tableTrail.pop();
  if (!s) return;
  const trail = [...ui.tableTrail];
  if (s.obj !== props.id) actions.open(s.obj, { from: 'relation', tab: 'tables' });
  ui.table = s.table;
  ui.tableTrail = trail;
}

function pickTab(t: Tab) { ui.tab = ui.tab === t ? '' : t; }
function pickSource(s: Source) { ui.source = s; ui.module = ''; ui.op = -1; }
function pickModule(name: string) { ui.module = ui.module === name ? '' : name; ui.op = -1; }
/** 选中状态和流程图共用：选中流程图里有的操作，切过去也是它 */
function pickOp(i: number) {
  ui.op = ui.op === i ? -1 : i;
  const f = ui.op >= 0 ? activeModule.value?.fns[ui.op] : undefined;
  const pid = f ? opOfFn(props.id, f) : '';
  if (pid) ui.pop = pid;
}
</script>

<template>
  <div class="obj" :class="[state, { hub, core: obj.importance === 'core', expanded, inferred: obj.confidence === 'inferred' }]" :style="{ '--c': color }">
    <Handle type="target" :position="Position.Top" class="ghost-handle" />
    <Handle type="source" :position="Position.Bottom" class="ghost-handle" />

    <div v-if="!expanded" class="pin">
      <span class="mark">{{ obj.name[0] }}</span>
      <span class="label">{{ obj.name }}</span>
      <span v-if="layers.functions && fnCount" class="cnt" title="功能数">{{ fnCount }}</span>
      <span v-if="hub && layers.relations && rels.length" class="hub-badge" :title="`和 ${rels.length} 个对象有关系：全图下按领域合成粗线，悬停这里看逐条`">⟷ {{ rels.length }}</span>
      <button class="pin-hide nodrag" title="已经懂了，从地图上收起（左侧列表里可以放回）" @click.stop="toggleObject(id)">✕</button>
    </div>

    <div v-else class="district" :class="{ mini: !tab }">
      <header class="d-head">
        <span class="mark big">{{ obj.name[0] }}</span>
        <!-- 标题和描述可以划选问 AI，不当拖动把手 -->
        <div class="d-title nodrag">
          <h2>{{ obj.name }}<i class="conf" :class="obj.confidence" :title="obj.confidence === 'confirmed' ? '有代码证据' : 'AI 推断'" /></h2>
          <p>{{ obj.summary.text }}</p>
        </div>
        <button class="d-hide nodrag" title="已经懂了，从地图上收起（左侧列表里可以放回）" @click.stop="toggleObject(id)">从地图收起</button>
        <button class="close nodrag" title="关闭卡片（Esc）" @click.stop="actions.close()">✕</button>
      </header>

      <nav class="d-tabs nodrag">
        <button v-for="t in tabs" :key="t.tab" class="d-tab" :class="{ on: tab === t.tab }" @click.stop="pickTab(t.tab)">
          <i>{{ t.icon }}</i>{{ t.label }}<em>{{ t.n }}</em>
        </button>
      </nav>

      <div v-if="tab" class="d-body nodrag nowheel">
        <section v-if="tab === 'functions'" class="sec">
          <div v-if="sources.length > 1" class="seg">
            <button v-for="s in sources" :key="s.key" :class="{ on: source === s.key }" :title="s.hint" @click.stop="pickSource(s.key)">
              {{ s.name }}<em>{{ s.n }}</em>
            </button>
          </div>
          <p class="muted seg-hint">{{ sourceHint }}</p>
          <div class="kind-legend">
            <span v-for="k in kindsHere" :key="k"><i :style="{ background: kindStyle(k).color }">{{ kindStyle(k).short }}</i>{{ k }}</span>
          </div>
          <div class="mods">
            <button v-for="m in modules" :key="m.name" class="mod" :class="{ on: ui.module === m.name }" @click.stop="pickModule(m.name)">
              <span class="mod-top"><b>{{ m.name }}</b><span class="n">{{ m.fns.length }}</span></span>
              <span class="verbs"><i v-for="k in m.kinds" :key="k" :style="{ background: kindStyle(k).color }" :title="k">{{ kindStyle(k).short }}</i></span>
            </button>
          </div>
          <div v-if="activeModule" class="ops">
            <button v-for="(f, i) in activeModule.fns" :key="i" class="op" :class="{ on: ui.op === i }"
              :style="{ '--k': kindStyle(f.kindName).color }" :data-ask="f.name"
              :data-ask-hint="`右键的这个操作：${f.name}（${f.kindName}）${f.http ? `，接口 ${f.method} ${f.http}` : ''}${f.file ? `，代码 ${codeAt(f)}` : ''}`" @click.stop="pickOp(i)">
              <i>{{ kindStyle(f.kindName).short }}</i>{{ f.name }}<span v-if="inProc(f)" class="in-proc" title="在流程图里">⟿</span>
            </button>
          </div>
          <div v-if="activeOp" class="op-detail">
            <span class="tag" :style="{ background: kindStyle(activeOp.kindName).color }">{{ activeOp.kindName }}</span>
            <b>{{ activeOp.name }}</b>
            <span v-if="pageCount(activeOp.callers)" class="muted">用在 {{ pageCount(activeOp.callers) }} 个页面</span>
            <template v-if="layers.code">
              <code>{{ activeOp.http }}</code>
              <code>{{ codeAt(activeOp) }}</code>
              <code v-for="c in activeOp.callers" :key="c" class="caller">{{ c }}</code>
            </template>
            <span v-else class="muted">打开「代码」图层可看接口与位置</span>

            <div v-if="activeProc" class="op-proc">
              <p v-if="activeProc.op.picks.length">
                <span class="k">要先选</span>
                <span v-for="(p, k) in activeProc.op.picks" :key="k" class="pick"><i class="dot" :style="{ background: objColor(p.objectId) }" />{{ p.label }}</span>
              </p>
              <p v-if="activeProc.op.writes.length">
                <span class="k">存到</span>
                <span v-for="t in activeProc.op.writes" :key="t.name" class="chip rw w" :title="t.why"><i>写</i>{{ t.name }}<code v-if="layers.code && t.tableName">{{ t.tableName }}</code></span>
              </p>
              <p v-if="activeProc.op.province">
                <span class="k">{{ provinceLabel }}</span>
                <span class="prov" :class="activeProc.op.province.mode">{{ provinceModes[activeProc.op.province.mode] }}</span>
                <span class="muted">{{ activeProc.op.province.text }}</span>
              </p>
              <button class="proc-link" title="切到流程图并选中这个操作" @click.stop="showOp(activeProc.id)">
                <span class="route-ic">⟿</span>前置 {{ activeProc.pre }} 项 · 后续 {{ activeProc.post }} 项<b>→ 在流程图中查看</b>
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'relations'" class="sec">
          <div class="rel-rows">
            <div v-if="upstream.length" class="rel-row">
              <span class="rel-kind">上游</span>
              <button v-for="r in upstream" :key="r.rel.id" class="chip" :class="r.rel.confidence" @click.stop="actions.open(r.other.id, { from: 'relation' })">
                <i class="dot" :style="{ background: colorOf(r.other.domainId) }" />{{ r.other.name }}<span class="arrow">→</span><span class="verb">{{ r.rel.label }}</span><small>{{ cardinality(r.rel.cardinality) }}</small>
              </button>
            </div>
            <div v-if="downstream.length" class="rel-row">
              <span class="rel-kind">下游</span>
              <button v-for="r in downstream" :key="r.rel.id" class="chip" :class="r.rel.confidence" @click.stop="actions.open(r.other.id, { from: 'relation' })">
                <span class="verb">{{ r.rel.label }}</span><span class="arrow">→</span><i class="dot" :style="{ background: colorOf(r.other.domainId) }" />{{ r.other.name }}<small>{{ cardinality(r.rel.cardinality) }}</small>
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'tables'" class="sec tbl">
          <!-- 上游：本对象的表里存了它们的 ID；下游：它们的表里存了本对象的 ID -->
          <div class="rel-rows">
            <div v-if="links.up.length" class="rel-row">
              <span class="rel-kind" title="本对象的表里存了这些表的 ID，要先有它们">上游</span>
              <button v-for="l in links.up" :key="l.tableId" class="chip table up" :class="{ on: ui.table === l.tableId, inferred: l.via.every(v => v.guess) }"
                :title="viaText(l)" @click.stop="pickTable(l.tableId)">
                <i class="dot" :style="{ background: ownerColor(l.tableId) }" /><b>{{ tableById.get(l.tableId)!.name }}</b><small>{{ viaCols(l) }}</small>
              </button>
            </div>
            <div class="rel-row">
              <span class="rel-kind">本对象</span>
              <button v-for="t in tables" :key="t.id" class="chip table" :class="[t.role, { on: ui.table === t.id }]" @click.stop="pickTable(t.id)">
                <b>{{ t.name }}</b><code v-if="layers.code || t.role === 'primary'">{{ t.tableName }}</code>
              </button>
            </div>
            <div v-if="links.down.length" class="rel-row">
              <span class="rel-kind" title="这些表里存了本对象的 ID，依赖本对象">下游</span>
              <button v-for="l in links.down" :key="l.tableId" class="chip table down" :class="{ on: ui.table === l.tableId, inferred: l.via.every(v => v.guess) }"
                :title="viaText(l)" @click.stop="pickTable(l.tableId)">
                <i class="dot" :style="{ background: ownerColor(l.tableId) }" /><b>{{ tableById.get(l.tableId)!.name }}</b><small>{{ viaCols(l) }}</small>
              </button>
            </div>
          </div>
          <p v-if="!hasCols" class="muted">没有字段数据：数据目录里加上 tables.json 就能看到字段和表之间的引用</p>

          <!-- 字段弹窗挂到页面最外层：卡片在画布里会被缩放，弹窗不跟着缩 -->
          <Teleport to="body">
          <div v-if="curTable" class="tbl-mask" @click.self="ui.table = ''">
          <div class="tbl-detail" role="dialog">
            <header>
              <button v-if="prevTable" class="tbl-back" :title="`回到：${prevLabel}`" @click.stop="backTable">← {{ prevLabel }}</button>
              <b>{{ curTable.name }}</b><code>{{ curTable.tableName }}</code>
              <button v-if="curOwner && curOwner !== id" class="owner" title="打开这张表所属的对象" @click.stop="openOwner(curOwner)">
                <i class="dot" :style="{ background: objColor(curOwner) }" />{{ objById.get(curOwner)!.name }}<span class="out">↗</span>
              </button>
              <span v-else-if="curDef?.from === 'entity'" class="muted" title="没找到建表 SQL，字段取自代码里的实体类，不含公共列">取自实体类</span>
              <button class="close sm" title="收起字段" @click.stop="ui.table = ''">✕</button>
            </header>
            <div v-if="curDef" class="cols">
              <div v-for="c in curDef.columns" :key="c.name" class="col-row" :class="{ pk: c.pk }">
                <code class="col-name">{{ c.name }}</code>
                <span class="col-tag"><i v-if="c.pk" class="badge pk">主键</i><i v-else-if="c.required" class="badge req">必填</i></span>
                <span class="col-note">{{ c.comment }}
                  <button v-if="c.ref?.tableId && tableById.has(c.ref.tableId)" class="ref" :class="{ inferred: c.ref.guess }"
                    :title="c.ref.guess ? '按字段名推断的引用' : '注释里写明的引用'" @click.stop="followTable(c.ref.tableId)">→ {{ tableById.get(c.ref.tableId)!.name }}</button>
                  <span v-else-if="c.ref?.tableName" class="ref ext">→ {{ c.ref.tableName }}</span>
                </span>
                <span class="col-type">{{ c.type }}</span>
              </div>
            </div>
            <p v-else class="muted">这张表没有字段数据</p>
          </div>
          </div>
          </Teleport>
        </section>

        <section v-else-if="tab === 'code'" class="sec code">
          <code v-for="(e, i) in evidence" :key="i" :title="e.excerpt">{{ codeAt(e) }}</code>
        </section>
      </div>

      <div v-if="obj.prerequisites.length && (tab === 'functions' || tab === 'relations')" class="d-foot nodrag">
        <span v-for="(p, i) in obj.prerequisites" :key="i" class="chip warn" :class="p.confidence">⚠ {{ p.text }}</span>
      </div>
    </div>
  </div>
</template>
