// 生成 src/vendor（宪章 II、VII）：打包 CodeMirror 与 markdown-it，复制其余渲染资源。
// 由 tauri.conf.json 的 beforeDevCommand / beforeBuildCommand 调用：npm run vendor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const mod = (...p) => path.join(root, 'node_modules', ...p);
const dest = path.join(root, 'src', 'vendor');
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(dest, to)), { recursive: true });
  fs.copyFileSync(from, path.join(dest, to));
};

fs.rmSync(dest, { recursive: true, force: true });

await build({
  entryPoints: [path.join(here, 'vendor-entry.mjs')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'CM',
  legalComments: 'none',
  outfile: path.join(dest, 'cm.js'),
  logLevel: 'warning',
});

copy(mod('katex/dist/katex.min.js'), 'katex/katex.min.js');
copy(mod('katex/dist/katex.min.css'), 'katex/katex.min.css');
for (const f of fs.readdirSync(mod('katex/dist/fonts'))) {
  if (f.endsWith('.woff2')) copy(mod('katex/dist/fonts', f), `katex/fonts/${f}`);
}

copy(mod('mermaid/dist/mermaid.min.js'), 'mermaid.min.js');

// highlight.js：核心 + 全部语言合并为一个文件（与 0.2.x 支持的语言范围一致）
const hljs = mod('@highlightjs/cdn-assets');
const languages = fs.readdirSync(path.join(hljs, 'languages')).filter((f) => f.endsWith('.min.js'));
fs.mkdirSync(path.join(dest, 'highlight'), { recursive: true });
fs.writeFileSync(
  path.join(dest, 'highlight', 'highlight.min.js'),
  ['highlight.min.js', ...languages.map((f) => `languages/${f}`)].map((f) => fs.readFileSync(path.join(hljs, f), 'utf8')).join('\n'),
);
copy(path.join(hljs, 'styles/github.min.css'), 'highlight/github.min.css');
copy(path.join(hljs, 'styles/github-dark.min.css'), 'highlight/github-dark.min.css');

// 随包分发的第三方代码保留许可证
for (const name of [
  '@codemirror/state',
  '@codemirror/view',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lang-markdown',
  '@codemirror/search',
  '@lezer/markdown',
  'markdown-it',
  'markdown-it-footnote',
  'markdown-it-mark',
  'markdown-it-task-lists',
  'katex',
  'mermaid',
  '@highlightjs/cdn-assets',
]) {
  const license = fs.readdirSync(mod(name)).find((f) => /^licen[sc]e/i.test(f));
  if (!license) throw new Error(`缺少许可证文件：${name}`);
  copy(mod(name, license), `licenses/${name.replace('/', '__')}.txt`);
}

let bytes = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else bytes += fs.statSync(p).size;
  }
};
walk(dest);
console.log(`vendor → src/vendor (${(bytes / 1048576).toFixed(2)} MB)`);
