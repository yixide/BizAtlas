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
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    if (value.confidence === 'confirmed' && (!value.evidence || value.evidence.length === 0)) {
      throw new Error('“已确认”信息必须附证据');
    }
    Object.values(value).forEach(inspect);
  };
  inspect(map);
  for (const id of Object.keys(map.layout?.positions ?? {})) check(map.objects, id, '布局');
  return map;
}
