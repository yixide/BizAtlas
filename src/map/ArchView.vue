<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { actions, codeAt, colorOf, isCode, layers, map, ownerOfTable, provinceLabel, tableById, ui } from './store';
import { arch, archChain, archLinks, archLinksOf, archNodes, layerNames, otherEnd, storeKind, storeKinds, type ArchLink, type Layer } from './arch';
import { usePan, useSideWidth } from './pan';

/** 固定四栏：数据来源 | 数据存储 | 系统（功能块装在一个大框里） | 用户 · 外部平台；没有内容的栏不占位 */
const W = 212, H = 74, ROW_GAP = 14, GROUP_GAP = 12, COL_GAP = 150, PAD_X = 36, PAD_Y = 18, HEAD_H = 40, GROUP_H = 24, FRAME_PAD = 16, FRAME_HEAD = 46;
const layerColor: Record<Layer, string> = { source: '#c27a10', store: '#3b6fd8', block: '#5560d6', user: '#11896b', external: '#8a8f98' };
const colorOfNode = (id: string) => {
  const n = archNodes.get(id)!;
  return n.layer === 'store' ? storeKind(n.item.kind).color : layerColor[n.layer];
};

const idsOf = (layer: Layer) => [...archNodes.values()].filter(n => n.layer === layer).map(n => n.item.id);
/** 按连到的已排好节点的平均位置排序，减少交叉；没连线的保持原顺序排在后面 */
const rank = new Map<string, number>();
function sortByNeighbors(ids: string[]) {
  const score = (id: string) => {
    const ys = archLinksOf(id).map(l => rank.get(otherEnd(l, id))).filter((v): v is number => v !== undefined);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity;
  };
  const s = new Map(ids.map(id => [id, score(id)]));
  return [...ids].sort((a, b) => (s.get(a)! === s.get(b)! ? 0 : s.get(a)! - s.get(b)!));
}
const setRank = (ids: string[]) => ids.forEach((id, i) => rank.set(id, i / Math.max(1, ids.length - 1)));

type Group = { title: string; color?: string; ids: string[] };
const blockIds = idsOf('block');
setRank(blockIds);
const storeGroups: Group[] = storeKinds.map(k => ({ title: k.name, color: k.color, ids: sortByNeighbors(idsOf('store').filter(id => storeKind(archNodes.get(id)!.item.kind).key === k.key)) }))
  .filter(g => g.ids.length);
setRank(storeGroups.flatMap(g => g.ids));
const sourceIds = sortByNeighbors(idsOf('source'));
const userIds = sortByNeighbors(idsOf('user')), externalIds = sortByNeighbors(idsOf('external'));

const columns = [
  { key: 'source', title: layerNames.source, groups: [{ title: '', ids: sourceIds }] },
  { key: 'store', title: layerNames.store, groups: storeGroups },
  { key: 'block', title: arch.system?.name || '系统', groups: [{ title: '', ids: blockIds }] },
  { key: 'right', title: externalIds.length ? `用户 · ${provinceLabel}` : layerNames.user,
    groups: externalIds.length ? [{ title: layerNames.user, ids: userIds }, { title: provinceLabel, ids: externalIds }] : [{ title: '', ids: userIds }] },
].map(c => ({ ...c, groups: c.groups.filter(g => g.ids.length) })).filter(c => c.groups.length);

/** 先按栏算各自的高度，再让每栏在最高的那栏里上下居中 */
const box = new Map<string, { x: number; y: number }>();
const heads: { text: string; x: number; y: number; color?: string }[] = [];
const colHeight = (c: typeof columns[number]) => c.groups.reduce((h, g, i) => h + (i ? GROUP_GAP : 0) + (g.title ? GROUP_H : 0) + g.ids.length * (H + ROW_GAP) - ROW_GAP, 0)
  + (c.key === 'block' ? FRAME_HEAD + FRAME_PAD : 0);
const tallest = Math.max(0, ...columns.map(colHeight));
columns.forEach((c, ci) => {
  const x = PAD_X + ci * (W + COL_GAP);
  let y = PAD_Y + HEAD_H + (tallest - colHeight(c)) / 2 + (c.key === 'block' ? FRAME_HEAD : 0);
  c.groups.forEach((g, gi) => {
    if (gi) y += GROUP_GAP;
    if (g.title) { heads.push({ text: g.title, x, y, color: g.color }); y += GROUP_H; }
    g.ids.forEach(id => { box.set(id, { x, y }); y += H + ROW_GAP; });
  });
});
const colTitles = columns.map((c, ci) => ({ text: c.title, x: PAD_X + ci * (W + COL_GAP), block: c.key === 'block' }));
const frame = (() => {
  if (!blockIds.length) return undefined;
  const ys = blockIds.map(id => box.get(id)!.y);
  const x = box.get(blockIds[0])!.x - FRAME_PAD, top = Math.min(...ys) - FRAME_HEAD;
  return { x, y: top, w: W + FRAME_PAD * 2, h: Math.max(...ys) + H + FRAME_PAD - top };
})();
const width = PAD_X * 2 + columns.length * W + Math.max(0, columns.length - 1) * COL_GAP;
const height = PAD_Y * 2 + HEAD_H + tallest + 8;

/**
 * 线总是从左边节点的右沿连到右边节点的左沿；同一条边上的多根线按另一头的高低错开接入点，免得挤成一点。
 * 箭头标数据流向：从左往右流的箭头在右端，反过来在左端，双向两头都有
 */
const ports = new Map<string, number>();
const sideKey = (id: string, side: 'l' | 'r') => `${id}:${side}`;
const bySide = new Map<string, ArchLink[]>();
archLinks.forEach(l => {
  const [a, b] = archNodes.get(l.from)!.col < archNodes.get(l.to)!.col ? [l.from, l.to] : [l.to, l.from];
  [[a, 'r'], [b, 'l']].forEach(([id, side]) => {
    const k = sideKey(id, side as 'l' | 'r');
    bySide.set(k, [...(bySide.get(k) ?? []), l]);
  });
});
bySide.forEach((list, k) => {
  const id = k.slice(0, k.lastIndexOf(':'));
  [...list].sort((p, q) => box.get(otherEnd(p, id))!.y - box.get(otherEnd(q, id))!.y)
    .forEach((l, i) => ports.set(`${k}|${l.from}>${l.to}`, H / 2 + (i - (list.length - 1) / 2) * Math.min(12, (H - 20) / Math.max(1, list.length - 1))));
});
const lines = archLinks.map(l => {
  const leftFirst = archNodes.get(l.from)!.col < archNodes.get(l.to)!.col;
  const [a, b] = leftFirst ? [l.from, l.to] : [l.to, l.from];
  const pa = box.get(a)!, pb = box.get(b)!;
  const x1 = pa.x + W + 1, y1 = pa.y + ports.get(`${sideKey(a, 'r')}|${l.from}>${l.to}`)!;
  const x2 = pb.x - 1, y2 = pb.y + ports.get(`${sideKey(b, 'l')}|${l.from}>${l.to}`)!;
  const dx = Math.max(40, (x2 - x1) / 2);
  return {
    l, key: `${l.from}>${l.to}`, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    start: l.both || !leftFirst, end: l.both || leftFirst, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
  };
});

const hover = ref('');
const sel = computed(() => (archNodes.has(ui.arch) ? ui.arch : ''));
const lit = computed(() => { const c = sel.value || hover.value; return c ? archChain(c) : undefined; });
const nodeState = (id: string) => (!lit.value ? '' : id === (sel.value || hover.value) ? 'cur' : lit.value.has(id) ? 'on' : 'dim');
const lineState = (l: ArchLink) => (!lit.value ? '' : lit.value.has(l.from) && lit.value.has(l.to) ? 'on' : 'dim');
/** 线少时标签全显示；线多了只给亮起的线显示，免得在两栏之间挤成一片 */
const showLabel = (l: ArchLink) => !!l.label && (lit.value ? lineState(l) === 'on' : archLinks.length <= 10);
const pick = (id: string) => { ui.arch = ui.arch === id ? '' : id; };
/** 详情面板打开后画布变窄、或从面板里点了别的节点：把选中的节点滚进可视区 */
watch(sel, async id => {
  await nextTick();
  if (id) document.querySelector(`.av-node[data-arch="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}, { immediate: true });

const cur = computed(() => (sel.value ? archNodes.get(sel.value)! : undefined));
const nameOf = (id: string) => archNodes.get(id)?.item.name ?? id;
const tagOf = (id: string) => {
  const n = archNodes.get(id)!;
  return n.layer === 'store' ? storeKind(n.item.kind).name : n.layer === 'source' && n.item.kind ? n.item.kind : layerNames[n.layer];
};
/** 和选中节点直接相连的：数据从谁来、流到谁、双向 */
const conn = computed(() => {
  const id = sel.value;
  const all = id ? archLinksOf(id) : [];
  return {
    both: all.filter(l => l.both),
    in: all.filter(l => !l.both && l.to === id),
    out: all.filter(l => !l.both && l.from === id),
  };
});
const tables = computed(() => (cur.value?.item.tables ?? []).filter(t => tableById.has(t)));
function openTable(tid: string) {
  const owner = ownerOfTable.get(tid);
  if (!owner) return;
  actions.open(owner, { tab: 'tables' });
  ui.table = tid;
}
const domains = computed(() => (cur.value?.item.domains ?? []).map(d => map.domains.find(x => x.id === d)).filter(Boolean)
  .map(d => ({ ...d!, objects: map.objects.filter(o => o.domainId === d!.id) })));
const evidence = computed(() => (cur.value?.item.evidence ?? []).filter(e => isCode(e.file)));
const askHint = (id: string) => {
  const n = archNodes.get(id)!;
  return `右键的这个架构节点：${layerNames[n.layer]} · ${n.item.name}${n.item.product ? `（${n.item.product}）` : ''}${n.item.evidence.map(e => `，代码 ${codeAt(e)}`).join('')}`;
};

const { panning, startPan, onWheel } = usePan();
const { detailW, startResize, resetWidth } = useSideWidth();
</script>

<template>
  <section class="pv av">
    <header class="pv-bar">
      <b>架构图</b>
      <span class="muted">{{ arch.system?.description || '数据从哪来、存在哪、经过哪块功能、到了谁手里' }}</span>
      <span class="pv-legend">
        <span><b class="av-arrow">⟶</b>箭头 = 数据流向</span><span><b class="av-arrow">⟷</b>双向</span><span><i class="lg opt" />虚线 / 虚框 = 推断</span>
      </span>
    </header>

    <div class="pv-main">
      <div ref="scroller" class="pv-scroll" :class="{ panning }" @click.self="ui.arch = ''" @pointerdown="startPan" @wheel="onWheel">
        <div class="pv-canvas" :style="{ width: width + 'px', height: height + 'px' }" @click.self="ui.arch = ''">
          <div v-if="frame" class="av-frame" :class="{ dim: lit && !blockIds.some(id => lit!.has(id)) }"
            :style="{ left: frame.x + 'px', top: frame.y + 'px', width: frame.w + 'px', height: frame.h + 'px' }">
            <b>{{ arch.system?.name || '系统' }}</b><small>{{ blockIds.length }} 块功能</small>
          </div>
          <svg class="pv-svg" :width="width" :height="height">
            <defs>
              <marker v-for="k in ['', 'on']" :id="`av-arrow${k}`" :key="k" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" class="av-head" :class="k" />
              </marker>
            </defs>
            <path v-for="ln in lines" :key="ln.key" class="av-link" :class="[lineState(ln.l), { inferred: ln.l.confidence === 'inferred' }]" :d="ln.d"
              :marker-start="ln.start ? `url(#av-arrow${lineState(ln.l) === 'on' ? 'on' : ''})` : undefined"
              :marker-end="ln.end ? `url(#av-arrow${lineState(ln.l) === 'on' ? 'on' : ''})` : undefined" />
          </svg>
          <span v-for="t in colTitles.filter(t => !t.block)" :key="t.text" class="av-col" :style="{ left: t.x + 'px', top: PAD_Y + 'px', width: W + 'px' }">{{ t.text }}</span>
          <span v-if="frame" class="av-col" :style="{ left: frame.x + FRAME_PAD + 'px', top: PAD_Y + 'px', width: W + 'px' }">系统</span>
          <span v-for="h in heads" :key="h.text + h.x" class="av-group" :style="{ left: h.x + 'px', top: h.y + 'px', width: W + 'px', '--c': h.color }">
            <i v-if="h.color" class="dot" :style="{ background: h.color }" />{{ h.text }}
          </span>
          <template v-for="ln in lines" :key="'t' + ln.key">
            <span v-if="showLabel(ln.l)" class="av-label" :class="lineState(ln.l)" :style="{ left: ln.mid.x + 'px', top: ln.mid.y + 'px' }">{{ ln.l.label }}</span>
          </template>

          <button v-for="[id, n] in archNodes" :key="id" class="av-node" :data-arch="id" :class="[n.layer, nodeState(id), { inferred: n.item.confidence === 'inferred' }]"
            :style="{ left: box.get(id)!.x + 'px', top: box.get(id)!.y + 'px', width: W + 'px', height: H + 'px', '--c': colorOfNode(id) }"
            :title="n.item.description" :data-ask-hint="askHint(id)"
            @click="pick(id)" @mouseenter="hover = id" @mouseleave="hover = ''">
            <span class="av-top">
              <b>{{ n.item.name }}</b>
              <small v-if="n.item.product" class="av-tag">{{ n.item.product }}</small>
              <small v-else-if="n.layer === 'source' && n.item.kind" class="av-tag">{{ n.item.kind }}</small>
            </span>
            <span v-if="n.item.clients?.length" class="av-clients">
              <small v-for="c in n.item.clients" :key="c">{{ c }}</small>
            </span>
            <span v-else class="av-desc">{{ n.item.description }}</span>
          </button>
        </div>
      </div>

      <div v-if="cur" class="pv-side" :style="{ width: detailW + 'px' }">
        <div class="pv-resize" title="拖动调整宽度（双击恢复默认）" @pointerdown.prevent="startResize" @dblclick="resetWidth" />
        <aside class="pv-detail">
          <header>
            <span class="tag" :style="{ background: colorOfNode(sel) }">{{ tagOf(sel) }}</span>
            <h3>{{ cur.item.name }}</h3>
            <span v-if="cur.item.confidence === 'inferred'" class="badge-inferred">推断</span>
            <button class="close sm" title="取消选中（Esc）" @click="ui.arch = ''">✕</button>
          </header>
          <p v-if="cur.item.product" class="muted">{{ cur.item.product }}</p>
          <p v-if="cur.item.description" class="av-text">{{ cur.item.description }}</p>

          <div v-if="cur.item.clients?.length" class="pv-sec">
            <h4>从哪里用</h4>
            <span v-for="c in cur.item.clients" :key="c" class="chip">{{ c }}</span>
          </div>
          <div v-for="g in ([['both', '双向往来'], ['in', '数据来自'], ['out', '数据流向']] as const)" v-show="conn[g[0]].length" :key="g[0]" class="pv-sec">
            <h4>{{ g[1] }}</h4>
            <button v-for="l in conn[g[0]]" :key="l.from + l.to" class="chip" :class="{ inferred: l.confidence === 'inferred' }" @click="pick(otherEnd(l, sel))">
              <i class="dot" :style="{ background: colorOfNode(otherEnd(l, sel)) }" />{{ nameOf(otherEnd(l, sel)) }}<small v-if="l.label">{{ l.label }}</small>
            </button>
          </div>
          <div v-if="tables.length" class="pv-sec">
            <h4>存了哪些表 · {{ tables.length }}</h4>
            <button v-for="t in tables" :key="t" class="chip table" :disabled="!ownerOfTable.has(t)" :title="ownerOfTable.has(t) ? '打开所属对象的数据表，看字段' : ''" @click="openTable(t)">
              {{ tableById.get(t)!.name }}<code v-if="layers.code">{{ tableById.get(t)!.tableName }}</code>
            </button>
          </div>
          <div v-if="domains.length" class="pv-sec col">
            <h4>管哪些业务</h4>
            <div v-for="d in domains" :key="d.id" class="av-domain">
              <span class="muted"><i class="dot" :style="{ background: colorOf(d.id) }" /> {{ d.name }}</span>
              <span class="chips">
                <button v-for="o in d.objects" :key="o.id" class="chip" :title="`打开「${o.name}」卡片`" @click="actions.open(o.id)">{{ o.name }}</button>
              </span>
            </div>
          </div>
          <div v-if="layers.code && evidence.length" class="pv-sec col code">
            <code v-for="e in evidence" :key="codeAt(e)">{{ codeAt(e) }}</code>
          </div>
        </aside>
      </div>
    </div>
    <div v-if="!cur" class="hint">点节点看数据的来龙去脉 · 悬停先预览 · Esc 返回地图</div>
  </section>
</template>
