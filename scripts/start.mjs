import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const index = args.indexOf('--data');
if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) {
  throw new Error('--data 后需要数据目录');
}
if (args.includes('--local')) {
  const config = JSON.parse(readFileSync(resolve('.local/atlas.json'), 'utf8'));
  process.env.ATLAS_DATA_DIR = resolve(config.dataDir);
  // 可选：源码目录，「问 AI」在这里面查真源
  if (config.sourceDir) process.env.ATLAS_SOURCE_DIR = resolve(config.sourceDir);
} else if (index >= 0) {
  process.env.ATLAS_DATA_DIR = resolve(args[index + 1]);
}
const source = args.indexOf('--source');
if (source >= 0) {
  if (!args[source + 1] || args[source + 1].startsWith('--')) throw new Error('--source 后需要源码目录');
  process.env.ATLAS_SOURCE_DIR = resolve(args[source + 1]);
}
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
