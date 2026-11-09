import { ref, useTemplateRef } from 'vue';

/** 按住鼠标在画布上拖动平移（在节点上按下也能拖，移动超过几像素才算拖，不会误触点击）；没有纵向滚动时，普通滚轮直接横向滚。画布元素在模板里写 ref="scroller" */
export function usePan() {
  const scroller = useTemplateRef<HTMLElement>('scroller');
  const panning = ref(false);
  function startPan(e: PointerEvent) {
    const el = scroller.value;
    if (!el || e.pointerType !== 'mouse' || e.button !== 0) return;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
    const x0 = e.clientX, y0 = e.clientY, l0 = el.scrollLeft, t0 = el.scrollTop;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      panning.value = true;
      el.scrollLeft = l0 - dx;
      el.scrollTop = t0 - dy;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      panning.value = false;
      // 拖完松手时浏览器还会补发一次 click：吞掉它，免得拖完就选中/取消选中
      if (moved) {
        const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  function onWheel(e: WheelEvent) {
    const el = scroller.value;
    if (!el || e.shiftKey || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (el.scrollHeight > el.clientHeight || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }
  return { panning, startPan, onWheel };
}

/** 详情面板拖左边缘调宽度，记在本机浏览器（流程图、架构图共用一个宽度） */
export function useSideWidth() {
  const MIN_W = 260, DEFAULT_W = 360;
  const maxW = () => Math.max(MIN_W, window.innerWidth * 0.6);
  const clampW = (w: number) => Math.round(Math.min(maxW(), Math.max(MIN_W, w)));
  const detailW = ref(clampW(Number((() => { try { return localStorage.getItem('atlas.detailW'); } catch { return null; } })()) || DEFAULT_W));
  function startResize(e: PointerEvent) {
    const x0 = e.clientX, w0 = detailW.value;
    const move = (ev: PointerEvent) => { detailW.value = clampW(w0 + x0 - ev.clientX); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      try { localStorage.setItem('atlas.detailW', String(detailW.value)); } catch { /* 无痕模式等 */ }
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  const resetWidth = () => { detailW.value = clampW(DEFAULT_W); };
  return { detailW, startResize, resetWidth };
}
