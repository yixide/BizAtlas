import { lintMap, readMap } from './data.mjs';
const map = readMap(process.argv[2] || process.env.ATLAS_DATA_DIR || 'examples/library/.bizatlas');
console.log(`数据校验通过：${map.objects.length} 个对象，${map.relations.length} 条关系，${map.flows.length} 个流程`);
const hints = lintMap(map);
if (hints.length) console.log(`\n质量提示（${hints.length} 条，不影响加载，但地图会乱）：\n${hints.map(h => `- ${h}`).join('\n')}`);
