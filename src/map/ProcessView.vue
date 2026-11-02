<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  byPlace, chainOf, codeAt, isCode, kindStyle, layers, moduleOfOp, objById, objColor, openOp, preOf, proc, procOp, provinceLabel, provinceModes, ui,
} from './store';

/** 列宽固定：模块从左到右按先后排成一排，操作只在本列下方纵向展开，不挪动别的列 */
const COL_W = 220, GAP = 84, PAD_X = 56, PAD_Y = 20, MOD_H = 58, OP_TOP = MOD_H + 26, OP_H = 46, OP_GAP = 12, INDENT = 14;
const colX = (c: number) => PAD_X + c * (COL_W + GAP);

const modules = proc.modules.map((m, col) => ({ ...m, col, x: colX(col), ops: m.ops.filter(id => moduleOfOp.get(id)?.mod === m) }));
/** 列内行号按过滤后的顺序算，脏数据不留空位 */
const rowOf = new Map(modules.flatMap(m => m.ops.map((id, row) => [id, row] as const)));
const opBox = (id: string) => {
  const { col } = moduleOfOp.get(id)!;
  return { x: colX(col) + INDENT, y: PAD_Y + OP_TOP + rowOf.get(id)! * (OP_H + OP_GAP), w: COL_W - INDENT, h: OP_H };
};

const sel = computed(() => (procOp(ui.pop) ? ui.pop : ''));
const pre = computed(() => (sel.value ? chainOf(sel.value, 'pre') : new Set<string>()));
const post = computed(() => (sel.value ? chainOf(sel.value, 'post') : new Set<string>()));
const touched = computed(() => new Set([sel.value, ...pre.value, ...post.value].filter(Boolean).map(id => moduleOfOp.get(id)!.mod.id)));
/** 选中操作时，链上涉及的模块自动展开（并入手动展开的集合，之后照样能手动收起） */
watch(touched, t => { ui.popen = [...new Set([...ui.popen, ...t])]; }, { immediate: true });
const shown = computed(() => new Set(ui.popen));
/** 从卡片跳过来、或点面包屑选中的操作可能在可视区外：滚过去 */
watch(sel, async id => {
  await nextTick();
  if (id) document.querySelector(`.pv-op[data-op="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}, { immediate: true });
const visible = (id: string) => shown.value.has(moduleOfOp.get(id)!.mod.id);

const width = PAD_X * 2 + modules.length * COL_W + Math.max(0, modules.length - 1) * GAP;
const height = computed(() => {
  const rows = Math.max(0, ...modules.filter(m => shown.value.has(m.id)).map(m => m.ops.length));
  return PAD_Y * 2 + (rows ? OP_TOP + rows * (OP_H + OP_GAP) : MOD_H) + 8;
});

const stateOf = (id: string) => (!sel.value ? '' : id === sel.value ? 'cur' : pre.value.has(id) ? 'pre' : post.value.has(id) ? 'post' : 'dim');

/** 只画这条链上的线：前置之间、后续之间 */
const links = computed(() => {
  const s = sel.value;
  if (!s) return [];
  const out: { from: string; to: string; kind: 'pre' | 'post'; optional: boolean }[] = [];
  for (const o of [s, ...pre.value]) for (const p of preOf(o)) if (pre.value.has(p.op)) out.push({ from: p.op, to: o, kind: 'pre', optional: !!p.optional });
  for (const o of post.value) for (const p of preOf(o)) if (p.op === s || post.value.has(p.op)) out.push({ from: p.op, to: o, kind: 'post', optional: !!p.optional });
  return out.filter(l => visible(l.from) && visible(l.to)).map(l => ({ ...l, d: pathOf(l.from, l.to) }));
});
/** 同列从左侧绕弯；跨列用曲线，从前一列的右边进后一列的左边 */
function pathOf(from: string, to: string) {
  const a = opBox(from), b = opBox(to);
  const ay = a.y + a.h / 2, by = b.y + b.h / 2;
  if (moduleOfOp.get(from)!.col === moduleOfOp.get(to)!.col) {
    const bend = Math.min(INDENT + 44, 22 + Math.abs(by - ay) * 0.22);
    return `M ${a.x} ${ay} C ${a.x - bend} ${ay}, ${b.x - bend} ${by}, ${b.x} ${by}`;
  }
  const forward = a.x < b.x;
  const x1 = forward ? a.x + a.w : a.x, x2 = forward ? b.x - 2 : b.x + b.w + 2;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
  return `M ${x1} ${ay} C ${x1 + dx} ${ay}, ${x2 - dx} ${by}, ${x2} ${by}`;
}

function toggleModule(id: string) {
  ui.popen = shown.value.has(id) ? ui.popen.filter(m => m !== id) : [...ui.popen, id];
}
const pick = (id: string) => { ui.pop = ui.pop === id ? '' : id; };
const reset = () => { ui.pop = ''; ui.popen = []; };

const cur = computed(() => (sel.value ? proc.ops[sel.value] : undefined));
const objName = (id: string) => objById.get(id)?.name ?? id;
const placeOf = (id: string) => `${moduleOfOp.get(id)!.mod.name} › ${proc.ops[id].name}`;
const preList = computed(() => [...pre.value].sort(byPlace));
const postList = computed(() => [...post.value].sort(byPlace));
const direct = computed(() => (sel.value ? preOf(sel.value) : []));
const evidence = computed(() => (cur.value?.evidence ?? []).filter(e => isCode(e.file)));

/** 详情面板拖左边缘调宽度，记在本机浏览器 */
const MIN_W = 260;
const maxW = () => Math.max(MIN_W, window.innerWidth * 0.6);
const clampW = (w: number) => Math.round(Math.min(maxW(), Math.max(MIN_W, w)));
const detailW = ref(clampW(Number((() => { try { return localStorage.getItem('atlas.detailW'); } catch { return null; } })()) || 360));
function startResize(e: PointerEvent) {
  const x0 = e.clientX, w0 = detailW.value;
  const move = (ev: PointerEvent) => { detailW.value = clampW(w0 + x0 - ev.clientX); };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('resizing');
    try { localStorage.setItem('atlas.detailW', String(detailW.value)); } catch { /* 无痕模式等 */ }
  };
  document.body.classList.add('resizing');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
</script>

<template>
  <section class="pv">
    <header class="pv-bar">
      <b>流程图</b>
      <span class="muted">模块从左到右按先后排 · 点模块展开操作 · 点操作看它的前后</span>
      <span class="pv-legend">
        <span><i class="lg pre" />要先准备</span><span><i class="lg cur" />当前</span><span><i class="lg post" />做完后能做</span>
        <span><i class="lg opt" />可选依赖</span>
      </span>
      <button class="pv-reset" title="取消选中、收起全部模块" @click="reset">↺ 重置</button>
    </header>

    <div class="pv-main">
      <div class="pv-scroll" @click.self="ui.pop = ''">
        <p v-if="!modules.length" class="pv-empty">数据目录里没有流程数据（process.json）</p>
        <div v-else class="pv-canvas" :style="{ width: width + 'px', height: height + 'px' }" @click.self="ui.pop = ''">
          <svg class="pv-svg" :width="width" :height="height">
            <defs>
              <marker v-for="k in ['mod', 'pre', 'post']" :id="`pv-arrow-${k}`" :key="k" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" :class="`pv-head ${k}`" />
              </marker>
            </defs>
            <!-- 相邻模块之间的箭头 = 粗粒度先后 -->
            <line v-for="m in modules.slice(0, -1)" :key="'m' + m.id" class="pv-mod-link" :class="{ dim: sel && !(touched.has(m.id) && touched.has(modules[m.col + 1].id)) }"
              :x1="m.x + COL_W + 6" :y1="PAD_Y + MOD_H / 2" :x2="m.x + COL_W + GAP - 8" :y2="PAD_Y + MOD_H / 2" marker-end="url(#pv-arrow-mod)" />
            <path v-for="(l, i) in links" :key="i" class="pv-link" :class="[l.kind, { optional: l.optional }]" :d="l.d" :marker-end="`url(#pv-arrow-${l.kind})`" />
          </svg>

          <button v-for="m in modules" :key="m.id" class="pv-mod" :class="{ open: shown.has(m.id), dim: sel && !touched.has(m.id) }"
            :style="{ left: m.x + 'px', top: PAD_Y + 'px', width: COL_W + 'px', height: MOD_H + 'px' }" :title="shown.has(m.id) ? '收起操作' : '展开操作'"
            @click="toggleModule(m.id)">
            <b>{{ m.name }}</b>
            <small>{{ m.ops.length }} 个操作</small>
            <i class="caret">{{ shown.has(m.id) ? '▾' : '▸' }}</i>
          </button>

          <template v-for="m in modules" :key="'ops' + m.id">
            <template v-if="shown.has(m.id)">
              <button v-for="id in m.ops" :key="id" class="pv-op" :data-op="id" :class="[stateOf(id), { inferred: proc.ops[id].confidence === 'inferred' }]"
                :style="{ left: opBox(id).x + 'px', top: opBox(id).y + 'px', width: opBox(id).w + 'px', height: OP_H + 'px', '--c': objColor(proc.ops[id].objectId) }"
                :data-ask-hint="`右键的这个操作：${objName(proc.ops[id].objectId)} · ${proc.ops[id].name}${(proc.ops[id].evidence ?? []).map(e => `，代码 ${codeAt(e)}`).join('')}`"
                @click="pick(id)">
                <i class="kind" :style="{ background: kindStyle(proc.ops[id].action ?? '').color }">{{ kindStyle(proc.ops[id].action ?? '').short }}</i>
                <span class="pv-op-text">
                  <b>{{ proc.ops[id].name }}</b>
                  <small><i class="dot" :style="{ background: objColor(proc.ops[id].objectId) }" />{{ objName(proc.ops[id].objectId) }}</small>
                </span>
              </button>
            </template>
          </template>
        </div>
      </div>

      <div v-if="cur" class="pv-side" :style="{ width: detailW + 'px' }">
      <div class="pv-resize" title="拖动调整宽度（双击恢复默认）" @pointerdown.prevent="startResize" @dblclick="detailW = clampW(360)" />
      <aside class="pv-detail">
        <header>
          <span class="tag" :style="{ background: kindStyle(cur.action ?? '').color }">{{ cur.action || '操作' }}</span>
          <h3>{{ cur.name }}</h3>
          <span v-if="cur.confidence === 'inferred'" class="badge-inferred">推断</span>
          <button class="close sm" title="取消选中（Esc）" @click="ui.pop = ''">✕</button>
        </header>
        <p class="muted">
          <i class="dot" :style="{ background: objColor(cur.objectId) }" /> {{ objName(cur.objectId) }} · {{ moduleOfOp.get(sel)!.mod.name }}
          <template v-if="cur.page"> · 在「{{ cur.page }}」页</template>
        </p>

        <div v-if="direct.length" class="pv-sec">
          <h4>直接依赖</h4>
          <button v-for="p in direct" :key="p.op" class="chip" :class="{ inferred: p.optional }" @click="pick(p.op)">
            {{ proc.ops[p.op].name }}<small v-if="p.optional">可选</small><small v-if="p.note">{{ p.note }}</small>
          </button>
        </div>
        <div v-if="cur.picks.length" class="pv-sec">
          <h4>要选什么</h4>
          <span v-for="(p, k) in cur.picks" :key="k" class="pick"><i class="dot" :style="{ background: objColor(p.objectId) }" />{{ p.label }}</span>
        </div>
        <div v-if="cur.writes.length" class="pv-sec col">
          <h4>数据存到</h4>
          <p v-for="t in cur.writes" :key="t.name" class="pv-write">
            <span class="chip rw w"><i>写</i>{{ t.name }}</span><code v-if="layers.code && t.tableName">{{ t.tableName }}</code>
            <span v-if="t.why" class="muted">{{ t.why }}</span>
          </p>
        </div>
        <div v-if="cur.province" class="pv-sec col">
          <h4>和{{ provinceLabel }}怎么交互</h4>
          <p><span class="prov" :class="cur.province.mode">{{ provinceModes[cur.province.mode] }}</span> <span class="muted">{{ cur.province.text }}</span></p>
        </div>
        <div v-if="cur.extras?.length" class="pv-sec col">
          <h4>额外说明</h4>
          <p v-for="(x, k) in cur.extras" :key="k" class="muted">· {{ x }}</p>
        </div>
        <div v-if="layers.code && evidence.length" class="pv-sec col code">
          <code v-for="e in evidence" :key="codeAt(e)">{{ codeAt(e) }}</code>
        </div>
        <button class="pv-open" :style="{ '--c': objColor(cur.objectId) }" @click="openOp(sel)">
          打开「{{ objName(cur.objectId) }}」卡片 →
        </button>
      </aside>
      </div>
    </div>

    <footer v-if="cur" class="pv-crumbs">
      <p>
        <span class="k pre">要先准备</span>
        <template v-if="preList.length">
          <button v-for="id in preList" :key="id" class="crumb-op pre" @click="pick(id)">{{ placeOf(id) }}</button>
        </template>
        <span v-else class="muted">无，可以直接做</span>
      </p>
      <p>
        <span class="k post">做完后能做</span>
        <template v-if="postList.length">
          <button v-for="id in postList" :key="id" class="crumb-op post" @click="pick(id)">{{ placeOf(id) }}</button>
        </template>
        <span v-else class="muted">暂无后续操作</span>
      </p>
    </footer>
    <div v-else class="hint">点模块展开操作 · 点操作看它的前置和后续 · Esc 返回地图</div>
  </section>
</template>
