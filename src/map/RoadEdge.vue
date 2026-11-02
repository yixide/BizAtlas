<script setup lang="ts">
import { computed } from 'vue';
import { EdgeLabelRenderer, type EdgeProps, type GraphNode } from '@vue-flow/core';
import type { Relation } from '../model';
import { cardinality, codeAt, isCode, layers, litRelation, visibleRel } from './store';

const props = defineProps<EdgeProps<{ rel: Relation }>>();
const rel = computed(() => props.data!.rel);

/** 连线从两个对象的边框出发，而不是固定把手：对象怎么拖、怎么放大，线都贴着边走 */
function anchor(node: GraphNode, toward: { x: number; y: number }) {
  const w = node.dimensions.width, h = node.dimensions.height;
  const c = { x: node.computedPosition.x + w / 2, y: node.computedPosition.y + h / 2 };
  const dx = toward.x - c.x, dy = toward.y - c.y;
  const k = Math.min((w / 2 + 6) / (Math.abs(dx) || 1e-6), (h / 2 + 6) / (Math.abs(dy) || 1e-6));
  return { c, p: { x: c.x + dx * k, y: c.y + dy * k } };
}
const geo = computed(() => {
  const s = props.sourceNode, t = props.targetNode;
  const sc = { x: s.computedPosition.x + s.dimensions.width / 2, y: s.computedPosition.y + s.dimensions.height / 2 };
  const tc = { x: t.computedPosition.x + t.dimensions.width / 2, y: t.computedPosition.y + t.dimensions.height / 2 };
  const a = anchor(s, tc).p, b = anchor(t, sc).p;
  return { d: `M${a.x},${a.y} L${b.x},${b.y}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
});
const state = computed(() => litRelation(rel.value));
const code = computed(() => rel.value.evidence.filter(e => isCode(e.file)));
const evidence = computed(() => code.value.map(codeAt).join('\n'));
</script>

<template>
  <template v-if="visibleRel(rel)">
    <path :d="geo.d" class="road-halo" :class="state" />
    <path :d="geo.d" class="road" :class="[state, rel.confidence]" :marker-end="markerEnd" />
    <EdgeLabelRenderer v-if="layers.labels">
      <div class="road-label nodrag nopan" :class="[state, rel.confidence]"
        :style="{ transform: `translate(-50%, -50%) translate(${geo.x}px, ${geo.y}px)` }">
        {{ rel.label }}<b>{{ cardinality(rel.cardinality) }}</b>
        <code v-if="layers.code && code.length" :title="evidence">{{ codeAt({ ...code[0], file: code[0].file.split('/').pop()! }) }}</code>
      </div>
    </EdgeLabelRenderer>
  </template>
</template>
