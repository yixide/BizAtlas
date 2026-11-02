// 验证公开、私有快照与拒绝坏数据的关键边界。测试副本只写系统临时目录。
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { readMap } from './data.mjs';
const source = readMap(process.argv[2] || 'examples/library/.bizatlas');
const directory = mkdtempSync(join(tmpdir(), 'atlas-data-'));
const cases = [
  ['不支持的版本', map => { map.schemaVersion = '999'; }],
  ['无证据的已确认', map => { map.objects[0].confidence = 'confirmed'; map.objects[0].evidence = []; }],
  ['不存在的对象', map => { map.relations[0].target = 'missing-object'; }],
  ['不存在的表', map => { map.flows[0].steps[0].reads.push('missing-table'); }],
  ['重复标识', map => { map.objects[1].id = map.objects[0].id; }],
  ['重复步骤标识', map => { map.flows[0].steps[1].id = map.flows[0].steps[0].id; }],
  ['步骤对象未列入流程', map => { map.flows[0].objectIds = []; }],
];
try {
  for (const [name, mutate] of cases) {
    const map = structuredClone(source); mutate(map);
    writeFileSync(join(directory, 'map.json'), JSON.stringify(map));
    assert.throws(() => readMap(directory), undefined, name);
  }
  console.log(`校验器边界验证通过：${cases.length} 类无效数据均被拒绝`);
} finally { rmSync(directory, { recursive: true, force: true }); }
