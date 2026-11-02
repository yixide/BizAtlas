<script setup lang="ts">
import { computed } from 'vue';
import { actions, colorOf, functions, map, sourceOf, statsOf, ui, type Tab } from './store';

const q = computed(() => ui.query.trim());
/** 搜索同时匹配对象名和功能名：搜「挂失」能直接落到借阅证 */
const domains = computed(() => map.domains.map(d => ({
  ...d,
  color: colorOf(d.id),
  items: map.objects.filter(o => o.domainId === d.id).map(o => {
    const hits = q.value ? (functions[o.id] ?? []).filter(f => f.name.includes(q.value) || f.group.includes(q.value)) : [];
    return { o, hits, stats: statsOf(o.id), show: !q.value || o.name.includes(q.value) || hits.length > 0 };
  }).filter(i => i.show),
})).filter(d => d.items.length));
const legend = computed(() => statsOf(map.objects[0]?.id ?? ''));

function openRow(i: { o: { id: string }; hits: { group: string }[] }) {
  const hit = (functions[i.o.id] ?? []).find(f => f.group === i.hits[0]?.group);
  actions.open(i.o.id, hit ? { module: hit.group, source: sourceOf(hit) } : {});
}
const openTab = (id: string, tab: Tab) => actions.open(id, { tab });
</script>

<template>
  <aside class="list" :class="{ closed: !ui.listOpen }">
    <header>
      <div>
        <b>{{ map.project.name }}</b>
        <small>{{ map.objects.length }} 个对象 · {{ map.relations.length }} 条关系</small>
      </div>
      <button class="icon" title="收起列表" @click="ui.listOpen = false">«</button>
    </header>
    <input v-model="ui.query" class="search" placeholder="搜对象或功能名称" />
    <div v-if="legend.length" class="legend">
      <span v-for="s in legend" :key="s.tab"><i>{{ s.icon }}</i>{{ s.label }}</span>
    </div>
    <div class="scroll">
      <section v-for="d in domains" :key="d.id">
        <h4><i class="dot" :style="{ background: d.color }" />{{ d.name }}</h4>
        <div v-for="i in d.items" :key="i.o.id" class="row" :class="{ on: ui.focus === i.o.id }" role="button"
          @click="openRow(i)" @mouseenter="ui.hover = i.o.id" @mouseleave="ui.hover = ''">
          <span class="mark sm" :style="{ '--c': d.color }">{{ i.o.name[0] }}</span>
          <span class="nm">{{ i.o.name }}</span>
          <span v-if="i.hits.length" class="hit">{{ i.hits.length }} 项匹配</span>
          <span v-else class="stats">
            <button v-for="s in i.stats" :key="s.tab" :class="{ zero: !s.n }" :title="`${s.label} ${s.n}`" @click.stop="s.n && openTab(i.o.id, s.tab)">
              <i>{{ s.icon }}</i>{{ s.n }}
            </button>
          </span>
        </div>
      </section>
    </div>
  </aside>
</template>
