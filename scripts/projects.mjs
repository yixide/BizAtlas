// 多项目：在 .local/projects.json 登记各项目的地图和源码目录，一个查看器里切换。
// 当前项目落到 ATLAS_DATA_DIR / ATLAS_SOURCES，地图和「问 AI」都从这两个变量取。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMap } from './data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryFile = resolve(root, '.local/projects.json');
const lastFile = resolve(root, '.local/last-project');
const example = { id: 'example', name: '图书馆示例', dataDir: resolve(root, 'examples/library/.bizatlas') };

/** 登记的项目，最后附上示例；路径相对 BizAtlas 根目录 */
export function listProjects() {
  const list = existsSync(registryFile) ? JSON.parse(readFileSync(registryFile, 'utf8')).projects ?? [] : [];
  return [...list.map(p => ({
    id: p.id, name: p.name || p.id,
    dataDir: resolve(root, p.dataDir),
    sources: sourcesOf(p),
  })), { ...example, sources: [] }];
}

/** 源码仓库：sources 是 {仓库标识: 目录}，第一个是主仓库；只有一个仓库时也可以写 sourceDir */
function sourcesOf(p) {
  if (p.sources) return Object.entries(p.sources).map(([id, dir]) => ({ id, dir: resolve(root, dir) }));
  return p.sourceDir ? [{ id: '', dir: resolve(root, p.sourceDir) }] : [];
}

function use(project) {
  process.env.ATLAS_PROJECT = project.id;
  process.env.ATLAS_DATA_DIR = project.dataDir;
  process.env.ATLAS_SOURCES = JSON.stringify(project.sources);
  delete process.env.ATLAS_SOURCE_DIR;
}

/** 当前项目的源码仓库；--source 临时指定的只有一个 */
export function currentSources() {
  if (process.env.ATLAS_SOURCE_DIR) return [{ id: '', dir: process.env.ATLAS_SOURCE_DIR }];
  try { return JSON.parse(process.env.ATLAS_SOURCES || '[]'); } catch { return []; }
}

/** 启动时选项目：--data 指定的目录 > --project > 上次打开的 > 第一个登记的 */
export function pickProject(id) {
  const list = listProjects();
  if (process.env.ATLAS_DATA_DIR) {
    const same = list.find(p => p.dataDir === process.env.ATLAS_DATA_DIR);
    if (same) use(same);
    return;
  }
  const last = existsSync(lastFile) ? readFileSync(lastFile, 'utf8').trim() : '';
  if (id && !list.some(p => p.id === id)) throw new Error(`没有登记这个项目：${id}，可选：${list.map(p => p.id).join('、')}`);
  use(list.find(p => p.id === id) ?? list.find(p => p.id === last) ?? list[0]);
}

const virtualIds = ['\0virtual:atlas-map', '\0virtual:atlas-functions', '\0virtual:atlas-process', '\0virtual:atlas-tables', '\0virtual:atlas-projects'];

export function projectsPlugin() {
  return {
    name: 'atlas-projects',
    resolveId(id) { if (id === 'virtual:atlas-projects') return '\0' + id; },
    load(id) {
      if (id !== '\0virtual:atlas-projects') return;
      // 打包时不带项目列表，免得把本机的私有项目名带出去
      if (this.environment?.mode === 'build') return 'export default { current: "", list: [] }';
      this.addWatchFile(registryFile);
      const current = process.env.ATLAS_PROJECT || '';
      const list = listProjects().map(p => ({ id: p.id, name: p.name }));
      // --data 临时指定的目录不在登记里，也列出来
      if (!current) list.unshift({ id: '', name: basename(dirname(process.env.ATLAS_DATA_DIR || '')) || '当前目录' });
      return `export default ${JSON.stringify({ current, list })}`;
    },
    configureServer(server) {
      server.middlewares.use('/__atlas/project', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          const project = listProjects().find(p => p.id === String(JSON.parse(body || '{}').id));
          if (!project) { res.statusCode = 404; res.end('没有登记这个项目'); return; }
          // 先校验，坏数据不切过去
          try { readMap(project.dataDir); } catch (e) { res.statusCode = 400; res.end(`这个项目的地图打不开：${e.message}`); return; }
          use(project);
          try { mkdirSync(dirname(lastFile), { recursive: true }); writeFileSync(lastFile, project.id); } catch { /* 记不住上次也不影响切换 */ }
          const graph = server.environments.client.moduleGraph;
          virtualIds.forEach(v => { const m = graph.getModuleById(v); if (m) graph.invalidateModule(m); });
          res.end('ok');
          server.ws.send({ type: 'full-reload' });
        });
      });
    },
  };
}
