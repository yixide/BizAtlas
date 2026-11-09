import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
// Node 端校验并仅打包指定地图，不开放目录读取接口。
// @ts-expect-error 独立 Node 工具模块在运行时由 Vite 载入
import { readMap } from './scripts/data.mjs';
// @ts-expect-error 同上
import { askPlugin } from './scripts/ask.mjs';
// @ts-expect-error 同上
import { projectsPlugin } from './scripts/projects.mjs';

export default defineConfig({
  plugins: [vue(), askPlugin(), projectsPlugin(), {
    name: 'atlas-map',
    resolveId(id) { if (['virtual:atlas-map', 'virtual:atlas-functions', 'virtual:atlas-process', 'virtual:atlas-tables', 'virtual:atlas-architecture'].includes(id)) return '\0' + id; },
    load(id) {
      // 可选的附加数据：功能清单、功能先后（流程图）、表字段、架构图；缺文件时给空
      const extra = {
        '\0virtual:atlas-functions': ['functions.json', '{}'],
        '\0virtual:atlas-process': ['process.json', '{ "modules": [], "ops": {} }'],
        '\0virtual:atlas-tables': ['tables.json', '{}'],
        '\0virtual:atlas-architecture': ['architecture.json', '{}'],
      }[id];
      if (extra) {
        const file = resolve(process.env.ATLAS_DATA_DIR || 'examples/library/.bizatlas', extra[0]);
        if (!existsSync(file)) return `export default ${extra[1]}`;
        this.addWatchFile(file);
        return `export default ${readFileSync(file, 'utf8')}`;
      }
      if (id === '\0virtual:atlas-map') {
        const directory = process.env.ATLAS_DATA_DIR || 'examples/library/.bizatlas';
        this.addWatchFile(resolve(directory, 'map.json'));
        return `export default ${JSON.stringify(readMap(directory))}`;
      }
    },
  }],
  server: {
    host: '127.0.0.1',
    fs: { deny: ['**/.local/**', '**/.git/**', '**/.env*'] },
  },
});
