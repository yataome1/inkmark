// 锚定（FR-606）：显示变化后在绘制前调整滚动，让被点击或光标所在的内容留在原来的屏幕位置。
/* global CM, LivePreview */
/* CM 在 Node 单元测试中不存在：delta 为纯函数，其余只在浏览器中运行 */
'use strict';

(function (root) {
  const delta = (before, after) => Math.round(after - before);

  const NAV_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end' };

  let keyboardAnchor = false; // 方向键移动时由锚定负责滚动，不用 CodeMirror 默认的滚动

  const noDefaultScroll = () =>
    CM.EditorState.transactionFilter.of((tr) =>
      keyboardAnchor && tr.scrollIntoView && !tr.docChanged ? { selection: tr.newSelection, effects: tr.effects, userEvent: 'select' } : tr,
    );

  function extension() {
    const plugin = CM.ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.view = view;
          this.pending = null;
          this.press = null;
          this.onDown = (e) => this.mouseDown(e);
          this.onKey = (e) => this.keyDown(e);
          this.onMove = (e) => this.mouseMove(e);
          this.onUp = () => this.mouseUp();
          view.contentDOM.addEventListener('mousedown', this.onDown, true);
          view.contentDOM.addEventListener('keydown', this.onKey, true);
          window.addEventListener('mousemove', this.onMove);
          window.addEventListener('mouseup', this.onUp);
        }

        get enabled() {
          return !this.view.dom.closest('.typewriter-mode');
        }

        posAnchor(pos) {
          const c = this.view.coordsAtPos(pos);
          return c && { pos, top: c.top };
        }

        mouseDown(e) {
          this.pending = null;
          if (e.button !== 0 || e.target.closest('.im-table,.im-check')) return;
          let anchor;
          const el = e.target.closest('[data-source]');
          if (el) {
            anchor = { tag: el.tagName, source: el.dataset.source, top: el.getBoundingClientRect().top };
          } else {
            const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
            anchor = pos === null ? null : this.posAnchor(pos);
          }
          // 块小部件自己放置光标，不经过 CodeMirror 的鼠标选择
          if (e.target.closest('.im-block')) {
            this.pending = anchor;
            return;
          }
          // 按住期间冻结显示：布局变化时 CodeMirror 会用原坐标重新取位置，选区会错位（US4-5）
          this.press = { x: e.clientX, y: e.clientY, anchor, moved: false };
          LivePreview.setDragging(true);
        }

        mouseMove(e) {
          if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 4) this.press.moved = true;
        }

        mouseUp() {
          this.pending = null;
          if (!this.press) return;
          const { moved, anchor } = this.press;
          this.press = null;
          const target = moved ? this.posAnchor(this.view.state.selection.main.head) : anchor;
          LivePreview.setDragging(false);
          this.view.dispatch({ effects: LivePreview.refresh.of(null) });
          if (target) this.compensate(target);
        }

        keyDown(e) {
          this.pending = null;
          keyboardAnchor = false;
          const dir = NAV_KEYS[e.key];
          if (!dir || e.ctrlKey || e.altKey || e.metaKey || !this.enabled) return;
          const { view } = this;
          const range = view.state.selection.main;
          const origin = this.posAnchor(range.head);
          if (!origin) return;
          let dest = null;
          if (dir === 'up' || dir === 'down') dest = view.moveVertically(range, dir === 'down');
          else if (dir === 'left' || dir === 'right') dest = view.moveByChar(range, dir === 'right');
          this.pending = { ...origin, fallback: dest && this.posAnchor(dest.head) };
          keyboardAnchor = true;
        }

        update(u) {
          if (this.pending && u.selectionSet) {
            keyboardAnchor = false;
            const anchor = this.pending;
            this.pending = null;
            this.compensate(anchor);
          }
        }

        /** 锚点当前的屏幕 top；按键前的位置被收起时改用光标到达的位置 */
        locate(anchor) {
          const { view } = this;
          if (anchor.source !== undefined) {
            const found = [...view.contentDOM.querySelectorAll('[data-source]')]
              .filter((el) => el.tagName === anchor.tag && el.dataset.source === anchor.source)
              .map((el) => el.getBoundingClientRect().top)
              .sort((a, b) => Math.abs(a - anchor.top) - Math.abs(b - anchor.top));
            return found.length ? { before: anchor.top, after: found[0] } : null;
          }
          const target = LivePreview.isHidden(view.state, anchor.pos) && anchor.fallback ? anchor.fallback : anchor;
          const c = view.coordsAtPos(target.pos);
          return c && { before: target.top, after: c.top };
        }

        compensate(anchor) {
          if (!this.enabled) return;
          this.view.requestMeasure({
            read: () => {
              const at = this.locate(anchor);
              return at ? delta(at.before, at.after) : 0;
            },
            write: (d, view) => {
              if (d) view.scrollDOM.scrollTop += d;
              const head = view.coordsAtPos(view.state.selection.main.head, -1);
              const box = view.scrollDOM.getBoundingClientRect();
              if (head && head.top < box.top) view.scrollDOM.scrollTop -= box.top - head.top + 8;
              else if (head && head.bottom > box.bottom) view.scrollDOM.scrollTop += head.bottom - box.bottom + 8;
            },
          });
        }

        destroy() {
          this.view.contentDOM.removeEventListener('mousedown', this.onDown, true);
          this.view.contentDOM.removeEventListener('keydown', this.onKey, true);
          window.removeEventListener('mousemove', this.onMove);
          window.removeEventListener('mouseup', this.onUp);
        }
      },
    );
    return [plugin, noDefaultScroll()];
  }

  const api = { delta, extension };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Anchor = api;
})(this);
