<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { codeAt, map, modulesOf, objById, proc, ui } from './store';

/** 划词 → 旁边出「问 AI」→ 开发服务器调本机 AI 命令行，在源码里找真源 */
interface Ask { text: string; question: string; context: string[]; logs: string[]; answer: string; error: string; busy: boolean; ctrl?: AbortController }

const available = ref(false);
const pop = reactive({ show: false, x: 0, y: 0, text: '', context: [] as string[] });
const panel = reactive({ open: false, question: '' });
const asks = ref<Ask[]>([]);
const current = computed(() => asks.value[asks.value.length - 1]);
const body = ref<HTMLElement>();

/** 用户当时在看哪：对象、模块、选中的操作、流程图里的操作，带上代码位置让 AI 少走弯路 */
function contextNow() {
  const c = [`项目：${map.project.name}`, `视图：${ui.view === 'process' ? '流程图' : '地图'}`];
  if (ui.view === 'process' && ui.pop && proc.ops[ui.pop]) {
    const op = proc.ops[ui.pop];
    c.push(`流程图里选中的操作：${objById.get(op.objectId)?.name ?? op.objectId} · ${op.name}`);
    op.evidence?.forEach(e => c.push(`该操作的代码位置：${codeAt(e)}`));
  } else if (ui.focus) {
    c.push(`正在看的对象：${objById.get(ui.focus)?.name}`);
    if (ui.module) {
      c.push(`功能模块：${ui.module}`);
      const f = modulesOf(ui.focus, ui.source).find(m => m.name === ui.module)?.fns[ui.op];
      if (f) c.push(`选中的操作：${f.name}（${f.kindName}）${f.http ? `，接口 ${f.method} ${f.http}` : ''}${f.file ? `，代码 ${codeAt(f)}` : ''}`);
    }
  }
  return c;
}

function onUp(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest?.('.ask-pop, .ask-panel')) return;
  // 等浏览器把选区定下来
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || text.length > 300 || !sel?.rangeCount) { pop.show = false; return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    Object.assign(pop, { show: true, text, context: contextNow(), x: Math.min(r.right, innerWidth - 120), y: r.bottom + 6 > innerHeight - 40 ? r.top - 36 : r.bottom + 6 });
  });
}
const onScroll = () => { pop.show = false; };

/** 按钮上的字拖选不了：右键按钮弹「问 AI」，取按钮的名字（去掉角标、计数这些小字） */
function onMenu(e: MouseEvent) {
  const btn = (e.target as HTMLElement)?.closest?.('button, .pin') as HTMLElement | null;
  if (!btn || btn.closest('.ask-pop, .ask-panel') || window.getSelection()?.toString().trim()) return;
  let text = btn.dataset.ask ?? '';
  if (!text) {
    const copy = btn.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('i, em, small, kbd, .n, .in-proc, .verbs, .arrow, .cnt, .mark').forEach(n => n.remove());
    text = copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
  // ✕、☰ 这类图标按钮不算
  if (text.length < 2 || text.length > 300) return;
  e.preventDefault();
  const context = contextNow();
  if (btn.dataset.askHint) context.push(btn.dataset.askHint);
  Object.assign(pop, { show: true, text, context, x: Math.min(e.clientX + 50, innerWidth - 120), y: Math.min(e.clientY + 4, innerHeight - 40) });
}

function openPanel() {
  pop.show = false;
  panel.open = true;
  panel.question = '';
  window.getSelection()?.removeAllRanges();
  nextTick(() => (document.querySelector('.ask-q') as HTMLTextAreaElement)?.focus());
}

async function send() {
  const a = reactive<Ask>({ text: pop.text, question: panel.question.trim(), context: pop.context, logs: [], answer: '', error: '', busy: true, ctrl: new AbortController() });
  asks.value.push(a);
  panel.question = '';
  try {
    const res = await fetch('/__atlas/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: a.ctrl!.signal,
      body: JSON.stringify({ text: a.text, question: a.question, context: a.context }),
    });
    if (!res.ok || !res.body) throw new Error(await res.text() || `请求失败 ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines.filter(Boolean)) {
        const m = JSON.parse(l);
        if (m.log) { a.logs.push(m.log); if (a.logs.length > 200) a.logs.shift(); }
        if (m.answer) a.answer = m.answer;
        if (m.error) a.error = m.error;
      }
      nextTick(() => body.value?.scrollTo({ top: body.value.scrollHeight }));
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') a.error = (e as Error).message;
    else a.error = '已取消';
  } finally {
    a.busy = false;
  }
}
function cancel() { current.value?.ctrl?.abort(); }

/** 简单排版：代码、加粗、`文件:行号` 高亮；先转义 */
function render(md: string) {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/```[\s\S]*?```/g, s => `<pre>${s.slice(3, -3).replace(/^\w*\n/, '')}</pre>`)
    // [文件名:行号](完整路径) → 显示文件名，悬停看完整路径
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '<code title="$2">$1</code>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,4} (.+)$/gm, '<b class="h">$1</b>');
}
/** 过程里最后一句有意义的话，当进度提示 */
const lastLog = (a: Ask) => a.logs[a.logs.length - 1] ?? '正在启动…';

onMounted(async () => {
  try { available.value = (await (await fetch('/__atlas/ask')).json()).ok; } catch { available.value = false; }
  if (!available.value) return;
  window.addEventListener('mouseup', onUp);
  window.addEventListener('wheel', onScroll, { passive: true });
  window.addEventListener('contextmenu', onMenu);
});
onBeforeUnmount(() => {
  window.removeEventListener('mouseup', onUp); window.removeEventListener('wheel', onScroll); window.removeEventListener('contextmenu', onMenu);
});
</script>

<template>
  <button v-if="pop.show" class="ask-pop" :style="{ left: pop.x + 'px', top: pop.y + 'px' }" @mousedown.prevent @click="openPanel">
    ✦ 问 AI
  </button>

  <aside v-if="panel.open" class="ask-panel" @keydown.stop>
    <header>
      <b>✦ 问 AI</b><span class="muted">在源码里找真源，只读</span>
      <button class="close" title="关闭" @click="cancel(); panel.open = false">✕</button>
    </header>
    <div ref="body" class="ask-body">
      <div v-for="(a, i) in asks" :key="i" class="ask-item">
        <p class="ask-sel">「{{ a.text }}」<span v-if="a.question">{{ a.question }}</span></p>
        <div v-if="a.answer" class="ask-answer" v-html="render(a.answer)" />
        <p v-else-if="a.error" class="ask-err">{{ a.error }}</p>
        <p v-else class="ask-busy"><i class="spin" />{{ lastLog(a) }}</p>
        <details v-if="a.logs.length" class="ask-log">
          <summary>查找过程（{{ a.logs.length }} 行）</summary>
          <pre>{{ a.logs.join('\n') }}</pre>
        </details>
      </div>
    </div>
    <footer>
      <p class="ask-sel">「{{ pop.text }}」</p>
      <textarea v-model="panel.question" class="ask-q" rows="2" placeholder="想问什么？留空就是「这是什么意思，代码里怎么定义的」。Ctrl+Enter 发送"
        @keydown.ctrl.enter="!current?.busy && send()" />
      <div class="ask-actions">
        <span class="muted">会带上你当前所在的对象、模块和操作</span>
        <button v-if="current?.busy" @click="cancel">取消</button>
        <button v-else class="primary" @click="send">发送</button>
      </div>
    </footer>
  </aside>
</template>
