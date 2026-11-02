<script setup lang="ts">
import { toggleDomain } from './store';

defineProps<{ data: { id: string; name: string; color: string; w: number; h: number } }>();
</script>

<template>
  <div class="region" :style="{ width: `${data.w}px`, height: `${data.h}px`, '--c': data.color }">
    <span>{{ data.name }}</span>
    <button class="region-hide nodrag nopan" title="整个领域从地图上收起，左侧列表里可以放回" @click.stop="toggleDomain(data.id)">收起</button>
  </div>
</template>
