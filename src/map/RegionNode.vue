<script setup lang="ts">
defineProps<{ data: { name: string; color: string; w: number; h: number } }>();
</script>

<template>
  <div class="region" :style="{ width: `${data.w}px`, height: `${data.h}px`, '--c': data.color }">
    <span>{{ data.name }}</span>
  </div>
</template>
