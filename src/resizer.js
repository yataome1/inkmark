// 侧边栏分割线（FR-208、FR-209）：拖动调整宽度、拖过阈值收起、从左边缘拖出、双击复位、键盘操作。
'use strict';

(function (root) {
  const DEFAULT = 260;
  const MIN = 180;
  const COLLAPSE = 120;
  const STEP = 16;
  const maxWidth = () => Math.max(MIN, Math.min(560, innerWidth / 2));
  const clamp = (w) => Math.round(Math.min(Math.max(w, MIN), maxWidth()));

  /** @param {{ getSidebar: () => {visible: boolean, width?: number}, save: (patch: object) => void }} options */
  function init({ getSidebar, save }) {
    const app = document.getElementById('app');
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('resizer');

    const widthOf = () => getSidebar().width ?? DEFAULT;
    const show = (width, visible) => {
      sidebar.style.width = `${clamp(width)}px`;
      app.classList.toggle('no-sidebar', !visible);
    };
    const apply = () => show(widthOf(), getSidebar().visible);

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      const start = { x: e.clientX, width: widthOf(), visible: getSidebar().visible };
      let width = start.width;
      let visible = start.visible;
      let frame = 0;
      let moved = false;
      const move = (ev) => {
        if (Math.abs(ev.clientX - start.x) > 1) moved = true;
        visible = ev.clientX >= COLLAPSE;
        if (visible) width = clamp(ev.clientX);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => show(width, visible));
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        cancelAnimationFrame(frame);
        document.body.classList.remove('resizing');
        show(width, visible);
        if (moved) save({ width, visible });
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });

    handle.addEventListener('dblclick', () => {
      show(DEFAULT, true);
      save({ width: DEFAULT, visible: true });
    });

    handle.addEventListener('keydown', (e) => {
      const { visible } = getSidebar();
      let patch = null;
      if (e.key === 'Enter') patch = { visible: !visible };
      else if (visible && e.key === 'ArrowLeft') patch = { width: clamp(widthOf() - STEP) };
      else if (visible && e.key === 'ArrowRight') patch = { width: clamp(widthOf() + STEP) };
      if (!patch) return;
      e.preventDefault();
      show(patch.width ?? widthOf(), patch.visible ?? visible);
      save(patch);
    });

    // 窗口缩小时收窄到上限，不写入设置
    window.addEventListener('resize', apply);
    return { apply };
  }

  root.Resizer = { init };
})(this);
