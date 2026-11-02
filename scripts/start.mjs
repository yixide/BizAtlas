import { resolve } from 'node:path';
import { createServer } from 'vite';
import { pickProject } from './projects.mjs';

const args = process.argv.slice(2);
const valueOf = (flag, hint) => {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${flag} 后需要${hint}`);
  return args[index + 1];
};
const data = valueOf('--data', '数据目录');
if (data) process.env.ATLAS_DATA_DIR = resolve(data);
// 没指定数据目录就从 .local/projects.json 登记的项目里选
pickProject(valueOf('--project', '项目标识'));
// 可选：源码目录，「问 AI」在这里面查真源
const source = valueOf('--source', '源码目录');
if (source) process.env.ATLAS_SOURCE_DIR = resolve(source);
const server = await createServer();
await server.listen();
server.printUrls();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
