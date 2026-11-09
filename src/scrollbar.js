// 滚动条操作层（FR-611）：长文档的未渲染部分高度是估算值，拖动中总高度会变化，原生滚动条的滑块会逐渐偏离鼠标。
// 在原生滚动条上覆盖透明层，按鼠标位置换算滚动比例并逐帧应用；滚动条本身仍由浏览器绘制。
'use strict';

(function (root) {
  const LINE = 40;
  const REPEAT_DELAY = 300;
  const REPEAT_EVERY = 60;

  /** @param {HTMLElement} scroller 编辑器的滚动元素 @param {HTMLElement} content 高度随文档变化的内容元素 @param {HTMLElement} parent */
  function attach(scroller, content, parent) {
    const grip = document.createElement('div');
    grip.className = 'im-scroll-grip';
    parent.append(grip);

    const barWidth = () => scroller.offsetWidth - scroller.clientWidth;

    /** Windows 经典滚动条：两端箭头按钮的高度等于滚动条宽度 */
    function measure() {
      const arrow = barWidth();
      const track = scroller.clientHeight - 2 * arrow;
      const thumb = Math.max((track * scroller.clientHeight) / scroller.scrollHeight, arrow);
      const range = scroller.scrollHeight - scroller.clientHeight;
      const top = scroller.getBoundingClientRect().top + arrow;
      return { arrow, track, thumb, range, top, thumbTop: top + (track - thumb) * (range ? scroller.scrollTop / range : 0) };
    }

    function sync() {
      const width = barWidth();
      grip.hidden = !width;
      grip.style.width = `${width}px`;
    }
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    observer.observe(content);

    function dragThumb(down, geometry) {
      const grab = (down.clientY - geometry.thumbTop) / geometry.thumb;
      let y = down.clientY;
      let frame;
      const apply = () => {
        const g = measure();
        const ratio = Math.min(Math.max((y - g.top - grab * g.thumb) / (g.track - g.thumb), 0), 1);
        const target = ratio * g.range;
        if (Math.abs(scroller.scrollTop - target) >= 1) scroller.scrollTop = target;
        frame = requestAnimationFrame(apply);
      };
      frame = requestAnimationFrame(apply);
      const move = (e) => (y = e.clientY);
      const stop = () => {
        cancelAnimationFrame(frame);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', stop);
        grip.removeEventListener('pointercancel', stop);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', stop);
      grip.addEventListener('pointercancel', stop);
    }

    /** 箭头与轨道：按住时重复，轨道翻页到鼠标所在位置为止 */
    function repeat(step) {
      let timer = 0;
      const tick = (delay) => {
        if (step() !== false) timer = setTimeout(() => tick(REPEAT_EVERY), delay);
      };
      tick(REPEAT_DELAY);
      const stop = () => {
        clearTimeout(timer);
        grip.removeEventListener('pointerup', stop);
        grip.removeEventListener('pointercancel', stop);
      };
      grip.addEventListener('pointerup', stop);
      grip.addEventListener('pointercancel', stop);
    }

    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const g = measure();
      const y = e.clientY;
      if (y < g.top) repeat(() => void (scroller.scrollTop -= LINE));
      else if (y >= g.top + g.track) repeat(() => void (scroller.scrollTop += LINE));
      else if (y >= g.thumbTop && y <= g.thumbTop + g.thumb) dragThumb(e, g);
      else {
        repeat(() => {
          const now = measure();
          if (y >= now.thumbTop && y <= now.thumbTop + now.thumb) return false;
          scroller.scrollTop += (y < now.thumbTop ? -1 : 1) * scroller.clientHeight * 0.875;
        });
      }
    });
    grip.addEventListener('wheel', (e) => (scroller.scrollTop += e.deltaY), { passive: true });
    sync();
  }

  root.Scrollbar = { attach };
})(this);
