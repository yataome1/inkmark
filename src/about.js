// “关于”对话框（specs/009）：同一个 <dialog> 内切换关于、许可证、第三方声明、快捷键。
/* global SHORTCUTS */
'use strict';

(function (root) {
  const COPYRIGHT = 'Copyright (c) 2026 zhangmian';
  const UNKNOWN = '未知';
  const LINKS = [
    ['home', '项目主页'],
    ['changelog', '更新日志'],
    ['issues', '报告问题'],
    ['releases', '获取新版'],
  ];

  /** 复制到剪贴板的多行文本，用于粘贴到 Issue（FR-902） */
  function versionText({ version, commit, date, tauri, webview2, windows }) {
    return [
      `Inkmark ${version} (${commit || UNKNOWN}, ${date || UNKNOWN})`,
      `Tauri ${tauri}`,
      `WebView2 ${webview2 || UNKNOWN}`,
      windows || `Windows ${UNKNOWN}`,
    ].join('\n');
  }

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

  const fetchText = (url) => fetch(url).then((r) => r.text());

  /** @param {{ dialog: HTMLDialogElement, appInfo: () => Promise<object>, openLink: (kind: string) => void }} o */
  function create({ dialog, appInfo, openLink }) {
    let token = 0; // 切换视图后，较早的异步结果不再显示
    let thirdParty;

    function frame(title, back) {
      token++;
      const header = el('header', 'about-header');
      const heading = el('h2', 'about-heading', title);
      heading.id = 'about-title';
      header.append(heading);
      if (back) header.append(button('返回', showAbout));
      header.append(button('关闭', () => dialog.close()));
      const body = el('div', 'about-body');
      dialog.firstElementChild.replaceChildren(header, body);
      return { body, id: token };
    }

    function row(label, value) {
      const r = el('div', 'about-row');
      r.append(el('span', 'about-label', label), el('span', 'about-value', value || UNKNOWN));
      return r;
    }

    async function showAbout() {
      const { body, id } = frame('关于 Inkmark');
      const hero = el('div', 'about-hero');
      const icon = el('img', 'about-icon');
      icon.src = 'vendor/icon.png';
      icon.alt = '';
      const names = el('div');
      names.append(el('div', 'about-name', 'Inkmark'), el('div', 'about-muted', '本地 Markdown 查看与编辑器'));
      hero.append(icon, names);

      const versions = el('section', 'about-versions');
      const copy = button('复制版本信息', () => {});
      const links = el('section', 'about-links');
      links.append(...LINKS.map(([kind, label]) => button(label, () => openLink(kind), 'about-link')));
      const legal = el('section', 'about-legal');
      legal.append(el('div', '', COPYRIGHT), el('div', 'about-muted', '本软件按“原样”提供，不附带任何明示或暗示的担保，详见 MIT 许可证。'));
      const licenses = el('div', 'about-links');
      licenses.append(
        button('MIT 许可证', showLicense, 'about-link'),
        button('第三方声明', () => showThirdParty(true), 'about-link'),
      );
      legal.append(licenses);
      body.append(
        hero,
        versions,
        copy,
        links,
        legal,
        el('p', 'about-muted', '完全离线，无遥测，不收集任何数据。'),
        el('p', 'about-muted', '设计灵感来自 Typora。Inkmark 是独立的开源项目，与 Typora 无关。'),
      );
      copy.focus();

      const [info, build] = await Promise.all([
        appInfo().catch(() => ({})),
        fetch('vendor/build-info.json')
          .then((r) => r.json())
          .catch(() => ({})),
      ]);
      if (id !== token) return;
      const all = { ...info, ...build };
      versions.replaceChildren(
        row('版本', all.version),
        row('提交', all.commit),
        row('构建日期', all.date),
        row('Tauri', all.tauri),
        row('WebView2', all.webview2),
        row('系统', all.windows),
      );
      copy.onclick = async () => {
        await navigator.clipboard.writeText(versionText(all));
        copy.textContent = '已复制';
        setTimeout(() => (copy.textContent = '复制版本信息'), 1500);
      };
    }

    async function showLicense() {
      const { body, id } = frame('MIT 许可证', true);
      const text = await fetchText('vendor/LICENSE.txt');
      if (id === token) body.append(el('pre', 'about-text', text));
    }

    async function showThirdParty(back) {
      const { body, id } = frame('第三方声明', back);
      thirdParty ??= await fetch('vendor/third-party.json').then((r) => r.json());
      if (id !== token) return;
      const { packages, texts } = thirdParty;
      body.append(
        el(
          'p',
          'about-muted',
          `本软件包含以下 ${packages.length} 个开源组件，均未经修改。多选一许可的组件注明所选许可；MPL-2.0、EPL-2.0 组件的源码可从所列地址获取。`,
        ),
      );
      for (const p of packages) {
        const details = el('details', 'about-package');
        const summary = el('summary', '');
        const license = p.chosen === p.license ? p.license : `${p.license}，选用 ${p.chosen}`;
        summary.append(el('span', 'about-package-name', `${p.name} ${p.version}`), el('span', 'about-muted', license));
        details.append(summary);
        // 原文展开时才创建，组件很多
        details.addEventListener(
          'toggle',
          () => {
            if (details.open && details.children.length === 1) {
              if (p.sourceUrl) details.append(el('p', 'about-source', `源码：${p.sourceUrl}`));
              details.append(...p.texts.map((i) => el('pre', 'about-text', texts[i])));
            }
          },
          { once: true },
        );
        body.append(details);
      }
    }

    function showShortcuts() {
      const { body } = frame('键盘快捷键');
      const columns = el('div', 'about-shortcuts');
      for (const { group, items } of SHORTCUTS) {
        const box = el('section', 'about-shortcut-group');
        box.append(el('h3', 'about-group', group));
        for (const { label, keys, where } of items) {
          const r = el('div', 'about-row');
          r.append(el('span', 'about-value', where ? `${label}（${where}）` : label), el('kbd', 'about-key', keys));
          box.append(r);
        }
        columns.append(box);
      }
      body.append(columns);
    }

    dialog.append(el('div', 'about-frame'));
    dialog.setAttribute('aria-labelledby', 'about-title');
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());

    function open(show, ...args) {
      if (dialog.open) return;
      show(...args);
      dialog.showModal();
    }

    return {
      isOpen: () => dialog.open,
      about: () => open(showAbout),
      thirdParty: () => open(showThirdParty, false),
      shortcuts: () => open(showShortcuts),
    };
  }

  const api = { create, versionText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.About = api;
})(this);
