import archData from 'virtual:atlas-architecture';
import type { Confidence, Evidence } from '../model';

/** 架构图：数据来源 → 数据存储 → 系统（按职责分的功能块）→ 用户 / 外部平台；不看仓库怎么分 */
export type StoreKind = 'relational' | 'timeseries' | 'cache' | 'mq' | 'search' | 'file' | 'other';
interface Base { id: string; name: string; description?: string; confidence: Confidence; evidence: Evidence[] }
export interface ArchSource extends Base { kind?: string }
export interface ArchStore extends Base { kind: StoreKind; product?: string; tables?: string[] }
export interface ArchBlock extends Base { domains?: string[] }
export interface ArchUser extends Base { clients?: string[] }
export type ArchExternal = Base;
/** 箭头方向是数据流向；both 表示双向（读写、用户使用系统） */
export interface ArchLink { from: string; to: string; label?: string; both?: boolean; confidence: Confidence; evidence: Evidence[] }
export interface Architecture {
  system?: { name?: string; description?: string };
  sources?: ArchSource[]; stores?: ArchStore[]; blocks?: ArchBlock[]; users?: ArchUser[]; externals?: ArchExternal[];
  links?: ArchLink[];
}

export type Layer = 'source' | 'store' | 'block' | 'user' | 'external';
export interface ArchNode { layer: Layer; col: number; item: Base & Partial<ArchSource & ArchStore & ArchBlock & ArchUser> }

export const arch: Architecture = archData;
export const storeKinds: { key: StoreKind; name: string; color: string }[] = [
  { key: 'relational', name: '关系库', color: '#3b6fd8' },
  { key: 'timeseries', name: '时序库', color: '#0f8b8d' },
  { key: 'cache', name: '缓存', color: '#d64545' },
  { key: 'mq', name: '消息队列', color: '#7a5ad8' },
  { key: 'search', name: '搜索', color: '#cf8a0c' },
  { key: 'file', name: '文件存储', color: '#8a6d3b' },
  { key: 'other', name: '其他存储', color: '#8a8f98' },
];
export const storeKind = (k?: string) => storeKinds.find(s => s.key === k) ?? storeKinds[storeKinds.length - 1];
export const layerNames: Record<Layer, string> = { source: '数据来源', store: '数据存储', block: '功能块', user: '用户', external: '外部平台' };

/** 用户和外部平台同在最右一列 */
const colOf: Record<Layer, number> = { source: 0, store: 1, block: 2, user: 3, external: 3 };
export const archNodes = new Map<string, ArchNode>();
const add = (layer: Layer, list?: Base[]) => list?.forEach(item => { if (item?.id && !archNodes.has(item.id)) archNodes.set(item.id, { layer, col: colOf[layer], item }); });
add('source', arch.sources); add('store', arch.stores); add('block', arch.blocks); add('user', arch.users); add('external', arch.externals);
/** 两头都认识、不连自己、不在同一列的线才画 */
export const archLinks = (arch.links ?? []).filter(l => {
  const a = archNodes.get(l.from), b = archNodes.get(l.to);
  return a && b && l.from !== l.to && a.col !== b.col;
});
export const hasArch = archNodes.size > 0;

const linksOf = (id: string) => archLinks.filter(l => l.from === id || l.to === id);
export const otherEnd = (l: ArchLink, id: string) => (l.from === id ? l.to : l.from);
export { linksOf as archLinksOf };

/**
 * 选中一个节点时亮起的范围：向左只往更左的列走，向右只往更右的列走，顺着走到头。
 * 点业务库能看到写它的功能块、再到用这些功能块的用户；点读者能一路看到数据从哪来
 */
export function archChain(id: string) {
  const out = new Set([id]);
  const walk = (dir: 1 | -1) => {
    const stack = [id];
    const seen = new Set([id]);
    while (stack.length) {
      const cur = stack.pop()!;
      const c = archNodes.get(cur)!.col;
      for (const l of linksOf(cur)) {
        const o = otherEnd(l, cur);
        if (seen.has(o) || (archNodes.get(o)!.col - c) * dir <= 0) continue;
        seen.add(o); out.add(o); stack.push(o);
      }
    }
  };
  walk(1); walk(-1);
  return out;
}
