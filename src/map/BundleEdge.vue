<script setup lang="ts">
import { computed } from 'vue';
import { EdgeLabelRenderer, type EdgeProps } from '@vue-flow/core';
import { isHidden, layers, objById, objColor, ui, visibleRel, type Bundle } from './store';

/** 枢纽 → 领域地块的合并线：告诉人「它和这一整块都有关系」，悬停枢纽再拆成逐条 */
const props = defineProps<EdgeProps<{ bundle: Bundle }>>();
const b = computed(() => props.data!.bundle);
const rels = computed(() => b.value.rels.filter(visibleRel));
const center = computed(() => ui.focus || ui.hover);
/** 悬停别的对象时粗线退到背景；它和枢纽的那条会单独亮起 */
const state = computed(() => (center.value ? 'dim' : ''));
/** 中心是枢纽自己时逐条线已经画出来了，粗线让位 */
const shown = computed(() => rels.value.length > 0 && !isHidden(b.value.hub) && center.value !== b.value.hub);

const geo = computed(() => {
  const s = props.sourceNode, t = props.targetNode;
  const sc = { x: s.computedPosition.x + s.dimensions.width / 2, y: s.computedPosition.y + s.dimensions.height / 2 };
  const tc = { x: t.computedPosition.x + t.dimensions.width / 2, y: t.computedPosition.y + t.dimensions.height / 2 };
  const clip = (c: typeof sc, w: number, h: number, to: typeof sc, pad: number) => {
    const dx = to.x - c.x, dy = to.y - c.y;
    const k = Math.min((w / 2 + pad) / (Math.abs(dx) || 1e-6), (h / 2 + pad) / (Math.abs(dy) || 1e-6));
    return { x: c.x + dx * k, y: c.y + dy * k };
  };
  const a = clip(sc, s.dimensions.width, s.dimensions.height, tc, 6), z = clip(tc, t.dimensions.width, t.dimensions.height, sc, -2);
  return { d: `M${a.x},${a.y} L${z.x},${z.y}`, x: a.x + (z.x - a.x) * 0.55, y: a.y + (z.y - a.y) * 0.55 };
});
const title = computed(() => `${objById.get(b.value.hub)!.name} 和这个领域里 ${new Set(rels.value.flatMap(r => [r.source, r.target])).size - 1} 个对象有 ${rels.value.length} 条关系，悬停「${objById.get(b.value.hub)!.name}」看逐条`);
</script>

<template>
  <template v-if="shown && layers.relations">
    <path :d="geo.d" class="bundle" :class="state" :style="{ '--c': objColor(b.hub) }" />
    <EdgeLabelRenderer v-if="!state">
      <div class="bundle-label" :title="title" :style="{ transform: `translate(-50%, -50%) translate(${geo.x}px, ${geo.y}px)` }">
        ⟷ {{ rels.length }}
      </div>
    </EdgeLabelRenderer>
  </template>
</template>
