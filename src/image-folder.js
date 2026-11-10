// 图片文件夹对话框（specs/011 FR-1105）：查看、更改、打开、恢复默认。
'use strict';

(function (root) {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, action, className = 'about-button') {
    const b = el('button', className, text);
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  }

  /** @param {{ dialog: HTMLDialogElement, api: object, onStatus: (text: string) => void }} o */
  function create({ dialog, api, onStatus }) {
    dialog.append(el('div', 'about-frame'));
    dialog.setAttribute('aria-labelledby', 'image-folder-title');
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());

    async function change(path) {
      const info = await api.imageFolder();
      let copy = false;
      if (info.count > 0) {
        const choice = await api.confirmCopyImages(info.count);
        if (choice === 'cancel') return;
        copy = choice === 'copy';
      }
      try {
        const [copied, skipped] = await api.setImageFolder(path, copy);
        onStatus(copy ? `图片文件夹已更改，复制 ${copied} 张图片${skipped ? `，跳过 ${skipped} 张同名图片` : ''}` : '图片文件夹已更改');
      } catch (e) {
        alert(`无法更改图片文件夹：\n${e}`);
        return;
      }
      render();
    }

    async function render() {
      const info = await api.imageFolder();
      const header = el('header', 'about-header');
      const heading = el('h2', 'about-heading', '图片文件夹');
      heading.id = 'image-folder-title';
      header.append(
        heading,
        button('关闭', () => dialog.close()),
      );

      const body = el('div', 'about-body');
      const state = [info.isDefault ? '默认位置' : '自定义位置', `${info.count} 张图片`];
      if (!info.exists) state.push('文件夹不存在');
      const actions = el('div', 'image-folder-actions');
      const reset = button('恢复默认', () => change(null));
      reset.disabled = info.isDefault;
      actions.append(
        button('更改…', async () => {
          const path = await api.pickFolder();
          if (path && path !== info.path) change(path);
        }),
        button('打开文件夹', () => api.openImageFolder().catch((e) => alert(`无法打开文件夹：\n${e}`))),
        reset,
      );
      body.append(
        el(
          'p',
          'about-muted',
          '粘贴或拖入的图片保存在这里。可以设为同步盘中的文件夹，在多台电脑上共用，换电脑后设为同一个文件夹即可自动找到图片。',
        ),
        el('div', 'image-folder-path', info.path),
        el('div', 'about-muted', state.join(' · ')),
        actions,
      );
      dialog.firstElementChild.replaceChildren(header, body);
    }

    return {
      async show() {
        if (dialog.open) return;
        await render();
        dialog.showModal();
      },
    };
  }

  root.ImageFolder = { create };
})(this);
