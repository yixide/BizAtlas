<script setup lang="ts">
import { computed, ref } from 'vue';
import projects from 'virtual:atlas-projects';
import { actions, colorOf, functions, hidden, isHidden, map, sourceOf, statsOf, toggleDomain, toggleObject, ui, type Tab } from './store';

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

const hiddenCount = computed(() => map.objects.filter(o => isHidden(o.id)).length);
const showAll = () => { hidden.domains = []; hidden.objects = []; };

/** 点收起的对象：先放回地图再打开 */
function openRow(i: { o: { id: string }; hits: { group: string }[] }) {
  if (isHidden(i.o.id)) toggleObject(i.o.id);
  const hit = (functions[i.o.id] ?? []).find(f => f.group === i.hits[0]?.group);
  actions.open(i.o.id, hit ? { module: hit.group, source: sourceOf(hit) } : {});
}
const openTab = (id: string, tab: Tab) => actions.open(id, { tab });

/** 多项目：开发服务器换一份地图后整页刷新 */
const switching = ref(false);
async function switchTo(id: string) {
  switching.value = true;
  const res = await fetch('/__atlas/project', { method: 'POST', body: JSON.stringify({ id }) }).catch(() => undefined);
  if (res?.ok) { location.reload(); return; }
  alert(res ? await res.text() : '切换失败：开发服务器没响应');
  switching.value = false;
}
</script>

<template>
  <aside class="list" :class="{ closed: !ui.listOpen }">
    <header>
      <div>
        <select v-if="projects.list.length > 1" class="project" :value="projects.current" :disabled="switching"
          title="切换项目" @change="switchTo(($event.target as HTMLSelectElement).value)">
          <option v-for="p in projects.list" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <b>{{ map.project.name }}</b>
        <small>{{ map.objects.length }} 个对象 · {{ map.relations.length }} 条关系</small>
      </div>
      <button class="icon" title="收起列表" @click="ui.listOpen = false">«</button>
    </header>
    <input v-model="ui.query" class="search" placeholder="搜对象或功能名称" />
    <div v-if="legend.length" class="legend">
      <span v-for="s in legend" :key="s.tab"><i>{{ s.icon }}</i>{{ s.label }}</span>
    </div>
    <div v-if="hiddenCount" class="hidden-bar">
      已收起 {{ hiddenCount }} 个对象<button @click="showAll">全部显示</button>
    </div>
    <div class="scroll">
      <section v-for="d in domains" :key="d.id" :class="{ off: hidden.domains.includes(d.id) }">
        <h4>
          <i class="dot" :style="{ background: d.color }" />{{ d.name }}
          <button class="eye" :title="hidden.domains.includes(d.id) ? '放回地图' : '整个领域从地图上收起'" @click="toggleDomain(d.id)">
            {{ hidden.domains.includes(d.id) ? '显示' : '收起' }}
          </button>
        </h4>
        <div v-for="i in d.items" :key="i.o.id" class="row" :class="{ on: ui.focus === i.o.id, off: isHidden(i.o.id) }" role="button"
          @click="openRow(i)" @mouseenter="!isHidden(i.o.id) && (ui.hover = i.o.id)" @mouseleave="ui.hover = ''">
          <span class="mark sm" :style="{ '--c': d.color }">{{ i.o.name[0] }}</span>
          <span class="nm">{{ i.o.name }}</span>
          <button class="eye" :title="isHidden(i.o.id) ? '放回地图' : '已经懂了，从地图上收起'" @click.stop="toggleObject(i.o.id)">
            {{ isHidden(i.o.id) ? '显示' : '收起' }}
          </button>
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
