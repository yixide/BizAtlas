<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MarkerType, Panel, useVueFlow, VueFlow, type Edge, type GraphNode, type Node } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import ObjectNode from './ObjectNode.vue';
import RegionNode from './RegionNode.vue';
import RoadEdge from './RoadEdge.vue';
import BundleEdge from './BundleEdge.vue';
import ListPanel from './ListPanel.vue';
import ProcessView from './ProcessView.vue';
import ArchView from './ArchView.vue';
import { hasArch } from './arch';
import AskAi from './AskAi.vue';
import { actions, bundles, colorOf, hidden, history, isHidden, layers, map, moduleOfOp, objById, snap, snapLabel, ui, type OpenOpts } from './store';
import { boundsOf, pushAway, seedPositions, type Size, type XY } from './layout';

const { dimensions, findNode, fitBounds, setCenter, viewport } = useVueFlow('atlas');
const ids = map.objects.map(o => o.id);
/** home：对象在全图里的「家」，拖动会更新；放大时别人被推开，返回时回家 */
const home: Record<string, XY> = seedPositions(ids, map.layout?.positions);
const compact: Record<string, Size> = {};

const nodes = ref<Node[]>([
  ...map.domains.map(d => ({
    id: `region:${d.id}`, type: 'region', position: { x: 0, y: 0 }, data: { id: d.id, name: d.name, color: colorOf(d.id), w: 10, h: 10 },
    draggable: false, selectable: false, focusable: false, zIndex: -1, class: 'region-node',
  })),
  ...map.objects.map(o => ({ id: o.id, type: 'object', position: { ...home[o.id] }, data: {}, zIndex: 1 })),
]);
const edges = ref<Edge[]>([
  ...map.relations.map(r => ({
    id: r.id, type: 'road', source: r.source, target: r.target, data: { rel: r },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#9aa0aa' },
  })),
  ...bundles.map(b => ({ id: b.id, type: 'bundle', source: b.hub, target: `region:${b.domainId}`, data: { bundle: b }, zIndex: -1 })),
]);

const node = (id: string) => findNode(id) as GraphNode | undefined;
const frame = () => new Promise(r => requestAnimationFrame(r));

function updateRegions() {
  for (const d of map.domains) {
    const members = map.objects.filter(o => o.domainId === d.id && o.id !== ui.focus && !isHidden(o.id)).map(o => node(o.id)).filter(Boolean) as GraphNode[];
    const region = node(`region:${d.id}`);
    if (!region) continue;
    region.hidden = !members.length;
    if (!members.length) continue;
    const xs = members.flatMap(n => [n.position.x, n.position.x + n.dimensions.width]);
    const ys = members.flatMap(n => [n.position.y, n.position.y + n.dimensions.height]);
    const x = Math.min(...xs) - 48, y = Math.min(...ys) - 70;
    region.position = { x, y };
    region.data = { ...region.data, w: Math.max(...xs) + 48 - x, h: Math.max(...ys) + 40 - y };
  }
}

let raf = 0;
function tween(target: Record<string, XY>, ms: number) {
  cancelAnimationFrame(raf);
  const from: Record<string, XY> = {};
  Object.keys(target).forEach(id => { const n = node(id); if (n) from[id] = { ...n.position }; });
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    for (const id in from) {
      node(id)!.position = { x: from[id].x + (target[id].x - from[id].x) * e, y: from[id].y + (target[id].y - from[id].y) * e };
    }
    updateRegions();
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

const center = (id: string) => ({ x: home[id].x + compact[id].w / 2, y: home[id].y + compact[id].h / 2 });
const shownIds = () => { const s = ids.filter(id => !isHidden(id)); return s.length ? s : ids; };
/** 连地块的标题栏一起框进来，免得顶上的领域名和收起按钮被图层栏挡住 */
const allBounds = () => { const b = boundsOf(shownIds(), home, compact); return { x: b.x - 48, y: b.y - 110, width: b.width + 96, height: b.height + 150 }; };

/** also：顺着关系跳过来时，把出发的对象也框进镜头，看得出是从哪来的 */
function layoutFocus(camera: boolean, also = '') {
  const n = node(ui.focus);
  if (!n) return;
  const w = n.dimensions.width, h = n.dimensions.height, c = center(ui.focus);
  const rect = { x: c.x - w / 2, y: c.y - h / 2, w, h };
  const target = pushAway(rect, ui.focus, home, compact);
  target[ui.focus] = { x: rect.x, y: rect.y };
  tween(target, 520);
  if (!camera) return;
  let box = { x: rect.x, y: rect.y, width: w, height: h };
  if (also && target[also]) {
    const p = target[also], s = compact[also];
    const x = Math.min(box.x, p.x), y = Math.min(box.y, p.y);
    box = { x, y, width: Math.max(box.x + w, p.x + s.w) - x, height: Math.max(box.y + h, p.y + s.h) - y };
  }
  // 先保证字看得清：卡片按原大（缩放 1）显示，大屏上自然只占画布三分之一左右，周围对象还看得见；
  // 小屏放不下才缩，最多缩到 0.8，再小字就看不清了，宁可卡片比画布宽一点。内容再多就在卡片里滚动，镜头对准卡片顶部
  const W = dimensions.value.width, H = dimensions.value.height;
  const fitW = W / (box.width * 1.15);
  const zoom = Math.max(0.8, Math.min((W * 0.88) / w, fitW, 1));
  const cy = box.height * zoom > H * 0.9 ? box.y + (H * 0.45) / zoom : box.y + box.height / 2;
  setCenter(box.x + box.width / 2, cy, { zoom, duration: 650 });
}

async function focusOn(id: string, also = '') {
  if (ui.focus) node(ui.focus)!.zIndex = 1;
  ui.focus = id;
  node(id)!.zIndex = 20;
  await nextTick();
  for (let i = 0; i < 30 && node(id)!.dimensions.width < compact[id].w + 80; i++) await frame();
  layoutFocus(true, also);
}

/** 从列表、地图点开：直接看功能；顺着关系跳过去：只开小卡片并记下足迹，可以回退；从流程图过来：定位到那个操作 */
async function open(id: string, opts: OpenOpts = {}) {
  if (!objById.has(id)) return;
  ui.view = 'map';
  const prev = ui.focus;
  if (opts.from === 'relation' && prev && prev !== id) ui.trail.push({ id: prev, tab: ui.tab, module: ui.module, source: ui.source });
  else if (!opts.from) ui.trail = [];
  ui.tab = opts.tab ?? (opts.from === 'relation' ? '' : 'functions');
  ui.source = opts.source ?? 'page';
  ui.module = opts.module ?? '';
  ui.op = opts.op ?? -1;
  ui.table = '';
  if (prev === id) return;
  await focusOn(id, opts.from === 'relation' ? prev : '');
}

/** 面包屑：跳回足迹里的第 to 站 */
async function jump(to: number) {
  const stop = ui.trail[to];
  if (!stop) return;
  const from = ui.focus;
  ui.trail = ui.trail.slice(0, to);
  Object.assign(ui, { tab: stop.tab, module: stop.module, source: stop.source, op: -1, table: '' });
  await focusOn(stop.id, from);
}

async function close() {
  if (!ui.focus) return;
  node(ui.focus)!.zIndex = 1;
  ui.focus = '';
  ui.trail = [];
  ui.module = '';
  ui.op = -1;
  ui.table = '';
  await nextTick();
  await frame();
  tween({ ...home }, 460);
  fitBounds(allBounds(), { padding: 0.1, duration: 650 });
}
/** 状态一变就把变之前的样子压栈；一次操作里改的几个字段在同一轮里，只记一笔 */
let restoring = false;
watch(() => JSON.stringify(snap()), (_now, before) => {
  if (restoring) return;
  history.push(JSON.parse(before));
  if (history.length > 100) history.shift();
});
async function back() {
  const s = history.pop();
  if (!s) return;
  restoring = true;
  const from = ui.focus;
  Object.assign(ui, { view: s.view, tab: s.tab, module: s.module, source: s.source, op: s.op, pop: s.pop, arch: s.arch, table: s.table, trail: s.trail });
  if (s.focus && s.focus !== from) focusOn(s.focus, from);
  else if (!s.focus && from) close();
  await nextTick();
  restoring = false;
}
const backTo = computed(() => (history.length ? snapLabel(history[history.length - 1]) : ''));
Object.assign(actions, { open, back, close });

/** 放大后的卡片内容变高（点开功能模块）时，重新推一下周围对象 */
watch(() => (ui.focus ? node(ui.focus)?.dimensions.height : 0), (h, old) => {
  if (ui.focus && h && old && Math.abs(h - old) > 4) layoutFocus(true);
});
watch(() => [layers.functions, layers.relations, layers.tables, layers.code], async () => {
  await nextTick();
  updateRegions();
});

/** 收起的对象不画；正放大着的被收起了就回到全图 */
function applyHidden() {
  for (const id of ids) { const n = node(id); if (n) n.hidden = isHidden(id); }
  updateRegions();
}
watch(() => JSON.stringify(hidden), async () => {
  applyHidden();
  if (ui.focus && isHidden(ui.focus)) await close();
  else if (!ui.focus) fitBounds(allBounds(), { padding: 0.1, duration: 500 });
});

let ready = false;
function onReady() {
  if (ready) return;
  ready = true;
  for (const id of ids) {
    const n = node(id)!;
    compact[id] = { w: n.dimensions.width, h: n.dimensions.height };
  }
  applyHidden();
  fitBounds(allBounds(), { padding: 0.1 });
}
function onDragStop({ node: n }: { node: GraphNode }) {
  if (!ui.focus && n.type === 'object') home[n.id] = { ...n.position };
  updateRegions();
}
function onNodeClick({ node: n }: { node: GraphNode }) {
  if (n.type === 'object' && ui.focus !== n.id) open(n.id);
}
const onKey = (e: KeyboardEvent) => {
  const typing = (e.target as HTMLElement)?.closest?.('input, textarea');
  if (!typing && history.length && (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft'))) { e.preventDefault(); back(); return; }
  // 字段弹窗开着：Esc 只关弹窗
  if (e.key === 'Escape' && ui.table) { ui.table = ''; return; }
  // 流程图里：Esc 先取消选中，再按一次回地图
  if (ui.view === 'process') {
    if (e.key === 'Escape') { if (ui.pop) ui.pop = ''; else ui.view = 'map'; }
    return;
  }
  if (ui.view === 'arch') {
    if (e.key === 'Escape') { if (ui.arch) ui.arch = ''; else ui.view = 'map'; }
    return;
  }
  if (e.key === 'Escape' && ui.focus) close();
};
/** 鼠标侧键「后退」 */
const onMouse = (e: MouseEvent) => { if (e.button === 3 && history.length) { e.preventDefault(); back(); } };
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('mouseup', onMouse); });
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse); });

const far = computed(() => viewport.value.zoom < 0.55);
const crumb = computed(() => {
  const parts: { text: string; act?: () => void }[] = [{ text: '全图', act: () => (ui.focus ? close() : undefined) }];
  ui.trail.forEach((s, i) => parts.push({ text: objById.get(s.id)!.name, act: () => jump(i) }));
  if (ui.focus) parts.push({ text: objById.get(ui.focus)!.name, act: () => { ui.module = ''; ui.op = -1; } });
  if (ui.focus && ui.module) parts.push({ text: ui.module });
  return parts;
});
const layerDefs: { key: keyof typeof layers; label: string; icon: string }[] = [
  { key: 'relations', label: '关系', icon: '⟷' }, { key: 'labels', label: '标签', icon: '🏷' },
  { key: 'functions', label: '功能', icon: '▦' }, { key: 'tables', label: '数据表', icon: '⛁' },
  { key: 'code', label: '代码', icon: '</>' }, { key: 'inferred', label: '推断项', icon: '◌' },
];
const miniColor = (n: GraphNode) => (n.type === 'region' ? 'transparent' : colorOf(objById.get(n.id)?.domainId ?? ''));
/** 没有流程数据就不显示「流程图」切换 */
const hasProcess = moduleOfOp.size > 0;
const viewHints = { map: '对象、关系、功能全貌', process: '功能之间的先后：做了之后别人会用到的操作', arch: '数据从哪来、存在哪、经过哪块功能、到了谁手里' };
</script>

<template>
  <div class="atlas">
    <ListPanel />
    <main class="stage">
      <header class="viewbar">
        <button v-if="!ui.listOpen" class="icon" title="展开列表" @click="ui.listOpen = true">☰</button>
        <div v-if="hasProcess || hasArch" class="views" role="tablist">
          <button role="tab" :class="{ on: ui.view === 'map' }" @click="ui.view = 'map'"><i>◈</i>地图</button>
          <button v-if="hasProcess" role="tab" :class="{ on: ui.view === 'process' }" @click="ui.view = 'process'"><i>⟿</i>流程图</button>
          <button v-if="hasArch" role="tab" :class="{ on: ui.view === 'arch' }" @click="ui.view = 'arch'"><i>▤</i>架构图</button>
        </div>
        <!-- 用户一开始不知道快捷键：给一个显眼的后退按钮，旁边小字带上快捷键 -->
        <button class="go-back" :disabled="!backTo" :title="backTo ? `后退到：${backTo}（Backspace / Alt+← / 鼠标侧键）` : '还没有可后退的操作'" @click="back()">
          ← 后退<span v-if="backTo" class="go-back-to">{{ backTo }}</span><kbd>⌫</kbd>
        </button>
        <span class="viewbar-hint">{{ viewHints[ui.view] }}</span>
      </header>
      <!-- 流程图盖在地图上面，地图一直挂着：切回来时镜头、放大的卡片都还在 -->
      <div class="stage-body">
        <div class="frame" :class="{ far, focusing: !!ui.focus }" :inert="ui.view !== 'map'">
          <VueFlow id="atlas" :nodes="nodes" :edges="edges" :min-zoom="0.2" :max-zoom="2.4"
            :nodes-connectable="false" :zoom-on-double-click="false" :elevate-nodes-on-select="false" :elevate-edges-on-select="false"
            @nodes-initialized="onReady" @node-click="onNodeClick" @node-drag="updateRegions" @node-drag-stop="onDragStop"
            @pane-click="ui.focus && close()" @node-mouse-enter="({ node: n }) => n.type === 'object' && (ui.hover = n.id)"
            @node-mouse-leave="ui.hover = ''">
            <template #node-object="p"><ObjectNode :id="p.id" /></template>
            <template #node-region="p"><RegionNode :data="p.data" /></template>
            <template #edge-road="p"><RoadEdge v-bind="p" /></template>
            <template #edge-bundle="p"><BundleEdge v-bind="p" /></template>
            <Background :gap="22" :size="1.3" />
            <MiniMap pannable zoomable :node-color="miniColor" :node-border-radius="10" />
            <Controls position="bottom-left" :show-interactive="false" />
            <Panel position="top-left" class="crumbs">
              <template v-for="(c, i) in crumb" :key="i">
                <span v-if="i" class="sep">›</span>
                <button class="crumb" :class="{ last: i === crumb.length - 1 }" :disabled="!c.act || i === crumb.length - 1" @click="c.act?.()">{{ c.text }}</button>
              </template>
            </Panel>
            <Panel position="top-right" class="layers">
              <span class="layers-title">图层</span>
              <button v-for="l in layerDefs" :key="l.key" class="layer" :class="{ on: layers[l.key] }" @click="layers[l.key] = !layers[l.key]">
                <i>{{ l.icon }}</i>{{ l.label }}
              </button>
            </Panel>
          </VueFlow>
          <div v-if="!ui.focus" class="hint">点对象放大 · 拖动对象换位置 · 拖空白处平移 · 滚轮缩放 · Esc 返回</div>
        </div>
        <ProcessView v-if="ui.view === 'process'" />
        <ArchView v-if="ui.view === 'arch'" />
      </div>
    </main>
    <AskAi />
  </div>
</template>
