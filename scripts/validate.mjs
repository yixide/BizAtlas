import { lintArchitecture, lintMap, readMap } from './data.mjs';
const directory = process.argv[2] || process.env.ATLAS_DATA_DIR || 'examples/library/.bizatlas';
const map = readMap(directory);
console.log(`数据校验通过：${map.objects.length} 个对象，${map.relations.length} 条关系，${map.flows.length} 个流程`);
const hints = lintMap(map);
if (hints.length) console.log(`\n质量提示（${hints.length} 条，不影响加载，但地图会乱）：\n${hints.map(h => `- ${h}`).join('\n')}`);
const arch = lintArchitecture(directory, map);
if (arch.found) {
  console.log(`\n架构图：${arch.nodes} 个节点，${arch.links} 条连线`);
  if (arch.hints.length) console.log(`架构图提示（${arch.hints.length} 条，查看器会跳过这些内容）：\n${arch.hints.map(h => `- ${h}`).join('\n')}`);
}
