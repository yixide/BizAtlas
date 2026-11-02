export interface XY { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect extends XY, Size {}

/** 初始位置取地图里的布局提示（放大 1.4 倍给卡片留地方），没给的按网格排 */
export function seedPositions(ids: string[], hint: Record<string, XY> = {}) {
  const out: Record<string, XY> = {};
  ids.forEach((id, i) => { out[id] = hint[id] ? { x: hint[id].x * 1.4, y: hint[id].y * 1.4 } : { x: (i % 4) * 260, y: Math.floor(i / 4) * 200 }; });
  return out;
}

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 放大后的对象占地变大：把压到的对象沿离心方向推开，推开后的再连带推后面的 */
export function pushAway(rect: Rect, focus: string, home: Record<string, XY>, size: Record<string, Size>, gap = 60) {
  const zone = { x: rect.x - gap, y: rect.y - gap, w: rect.w + gap * 2, h: rect.h + gap * 2 };
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const center = (id: string) => ({ x: home[id].x + size[id].w / 2, y: home[id].y + size[id].h / 2 });
  const ids = Object.keys(home).filter(id => id !== focus)
    .sort((a, b) => Math.hypot(center(a).x - cx, center(a).y - cy) - Math.hypot(center(b).x - cx, center(b).y - cy));
  const out: Record<string, XY> = {};
  const placed: Rect[] = [];
  for (const id of ids) {
    const s = size[id];
    const p = { ...home[id] };
    let vx = center(id).x - cx, vy = center(id).y - cy;
    const len = Math.hypot(vx, vy);
    [vx, vy] = len < 1 ? [0, 1] : [vx / len, vy / len];
    const box = () => ({ x: p.x - 16, y: p.y - 16, w: s.w + 32, h: s.h + 32 });
    for (let i = 0; i < 400 && (hit(box(), zone) || placed.some(r => hit(box(), r))); i++) { p.x += vx * 10; p.y += vy * 10; }
    out[id] = p;
    placed.push({ x: p.x, y: p.y, w: s.w, h: s.h });
  }
  return out;
}

export function boundsOf(ids: string[], pos: Record<string, XY>, size: Record<string, Size>) {
  const xs = ids.flatMap(id => [pos[id].x, pos[id].x + size[id].w]);
  const ys = ids.flatMap(id => [pos[id].y, pos[id].y + size[id].h]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
