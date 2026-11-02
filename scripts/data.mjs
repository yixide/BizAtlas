import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(readFileSync(new URL('../schema/map.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

export function readMap(directory) {
  const map = JSON.parse(readFileSync(resolve(directory, 'map.json'), 'utf8'));
  if (!validate(map)) throw new Error(`地图格式无效：${JSON.stringify(validate.errors)}`);
  const ids = new Set();
  for (const item of [...map.domains, ...map.objects, ...map.relations, ...map.flows, ...map.flows.flatMap(f => f.steps), ...map.tables]) {
    if (ids.has(item.id)) throw new Error(`重复标识：${item.id}`);
    ids.add(item.id);
  }
  const check = (list, id, context) => {
    if (!list.some(item => item.id === id)) throw new Error(`${context} 引用了不存在的标识：${id}`);
  };
  for (const object of map.objects) {
    check(map.domains, object.domainId, object.name);
    object.tableRefs.forEach(ref => check(map.tables, ref.tableId, object.name));
  }
  for (const relation of map.relations) {
    check(map.objects, relation.source, relation.id);
    check(map.objects, relation.target, relation.id);
  }
  for (const flow of map.flows) {
    flow.objectIds.forEach(id => check(map.objects, id, flow.name));
    for (const step of flow.steps) {
      step.objectIds.forEach(id => {
        check(map.objects, id, flow.name);
        if (!flow.objectIds.includes(id)) throw new Error(`${flow.name} 的步骤对象未列入流程对象`);
      });
      [...step.reads, ...step.writes].forEach(id => check(map.tables, id, flow.name));
    }
  }
  const repos = new Set((map.project.repos ?? []).map(r => r.id));
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    if (value.confidence === 'confirmed' && (!value.evidence || value.evidence.length === 0)) {
      throw new Error('“已确认”信息必须附证据');
    }
    // 证据不写 repo 就是第一个仓库；写了必须在 project.repos 里声明过
    (Array.isArray(value.evidence) ? value.evidence : []).forEach(e => {
      if (e.repo && !repos.has(e.repo)) throw new Error(`证据引用了没在 project.repos 里声明的仓库：${e.repo}`);
    });
    Object.values(value).forEach(inspect);
  };
  inspect(map);
  for (const id of Object.keys(map.layout?.positions ?? {})) check(map.objects, id, '布局');
  return map;
}

/** 格式对但读起来乱的地方：不拦着加载，只提示整理的人回头改 */
export function lintMap(map) {
  const out = [];
  const name = id => map.objects.find(o => o.id === id)?.name ?? id;
  const n = map.objects.length, rels = map.relations;
  if (rels.length > n * 2) out.push(`关系 ${rels.length} 条，超过对象数（${n}）的两倍：只留业务上有意义的关联，不要把每个外键都画成关系`);
  const degree = new Map();
  rels.forEach(r => [r.source, r.target].forEach(id => degree.set(id, (degree.get(id) ?? 0) + 1)));
  for (const [id, d] of degree) {
    if (d > 8) out.push(`「${name(id)}」连了 ${d} 条关系，全图会被它的线盖满：平台、机构这类几乎每张表都带的范围字段不算关系，只连它直接管辖的对象`);
  }
  const generic = rels.filter(r => /引用$|^关联$|^相关$/.test(r.label));
  if (generic.length) out.push(`${generic.length} 条关系的标签是「引用 / 关联」这类空话（如「${generic[0].label}」）：写成业务动作，如「下属」「办理」「收取」`);
  if (rels.length >= 10 && new Set(rels.map(r => r.type)).size === 1) out.push(`关系类型全是 ${rels[0].type}：按含义区分 owns / belongs-to / uses / associates`);
  const unsure = rels.filter(r => r.confidence === 'inferred' && r.evidence.length);
  if (unsure.length > rels.length / 2) out.push(`${unsure.length} 条关系带了证据却标推断：有外键字段或关联表支撑的关系标 confirmed`);
  for (const d of map.domains) {
    const k = map.objects.filter(o => o.domainId === d.id).length;
    if (k > 9) out.push(`领域「${d.name}」有 ${k} 个对象：拆成更小的业务板块，每个 3–8 个`);
    if (k === 1 && n > 8) out.push(`领域「${d.name}」只有 1 个对象：并到相近的领域`);
  }
  return out;
}
