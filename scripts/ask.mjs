// 「问 AI」：开发服务器把选中的词和地图上下文拼成提示词，交给本机 AI 命令行在源码目录里只读查找真源。
// 只在本地开发服务器里有；源码目录由 ATLAS_SOURCE_DIR 指定，没配就不开放。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function promptOf({ text, question, context }) {
  const lines = [
    '你在一个业务系统的源码仓库里，只读，不得修改、创建或删除任何文件，不连数据库、不联网。',
    '用户在「业务地图」页面上选中了一段文字，想知道它在代码里的真实含义。',
    '',
    `选中的文字：${text}`,
    question ? `用户的问题：${question}` : '用户的问题：这是什么意思？在代码里是怎么定义和使用的？',
  ];
  if (context?.length) lines.push('', '页面上下文（用户当时在看的位置，帮助你缩小范围）：', ...context.map(c => `- ${c}`));
  lines.push(
    '',
    '请在源码里找到它的「真源」：最初定义它的地方（枚举、常量、数据表/字段、接口、页面文案、菜单配置等），再看主要在哪里被使用。',
    '地图上的文字可能是人工或 AI 归纳的叫法，和代码里的名字不完全一样，要按意思找；找不到就直说找不到，不要编。',
    '',
    '用中文回答，面向不看代码的业务人员，格式：',
    '1. 第一行一句话结论：它是什么。',
    '2. 「出处」：列出真源和关键使用处，每条写 `文件路径:行号` 加一句说明。',
    '3. 「解释」：用业务语言讲清楚它怎么起作用、有哪些取值或分支、和地图上的叫法是否一致。',
    '控制在 400 字以内。不要写「已应用某某规则/技能」、只读声明之类与问题无关的话。',
  );
  return lines.join('\n');
}

export function askPlugin() {
  return {
    name: 'atlas-ask',
    configureServer(server) {
      server.middlewares.use('/__atlas/ask', (req, res) => {
        const cwd = process.env.ATLAS_SOURCE_DIR;
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: !!cwd && existsSync(cwd) }));
          return;
        }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        if (!cwd || !existsSync(cwd)) {
          res.statusCode = 400;
          res.end('没有配置源码目录：在 .local/atlas.json 里加 "sourceDir"，或启动时加 --source <目录>');
          return;
        }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          let input;
          try { input = JSON.parse(body); } catch { res.statusCode = 400; res.end('请求格式不对'); return; }
          if (!input.text?.trim()) { res.statusCode = 400; res.end('没有选中文字'); return; }

          // 一行一个 JSON：{ log } 过程、{ answer } 最终回答、{ error } 失败
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          const send = o => res.write(JSON.stringify(o) + '\n');

          const dir = mkdtempSync(join(tmpdir(), 'atlas-ask-'));
          const out = join(dir, 'answer.md');
          // 提示词走 stdin；Windows 上 codex 是 .cmd/.ps1 包装，要经 shell 启动，参数里不放用户文字
          const child = spawn('codex', ['exec', '-', '-C', `"${cwd}"`, '-s', 'read-only', '--skip-git-repo-check', '--color', 'never', '-o', `"${out}"`],
            { shell: true, windowsHide: true });
          let done = false;
          const onData = d => String(d).split(/\r?\n/).filter(l => l.trim()).forEach(l => send({ log: l }));
          child.stdout.on('data', onData);
          child.stderr.on('data', onData);
          child.on('error', e => { done = true; send({ error: `启动 codex 失败：${e.message}` }); res.end(); });
          child.on('close', code => {
            if (done) return;
            done = true;
            const answer = existsSync(out) ? readFileSync(out, 'utf8').trim() : '';
            if (answer) send({ answer });
            else send({ error: `codex 没有给出回答（退出码 ${code}）` });
            rmSync(dir, { recursive: true, force: true });
            res.end();
          });
          // 用户关掉或取消：结束 codex
          res.on('close', () => { if (!done) { done = true; killTree(child); } });
          child.stdin.end(promptOf(input));
        });
      });
    },
  };
}

function killTree(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
  else child.kill('SIGTERM');
}
