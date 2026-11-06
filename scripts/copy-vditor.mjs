// 只复制 FR-103 所需的 Vditor 资源到 src/vendor/vditor（宪章 VII）。
// 由 tauri.conf.json 的 beforeDevCommand / beforeBuildCommand 调用：npm run vendor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'vditor');
const dest = path.join(root, 'src', 'vendor', 'vditor');

const KEEP = [
  'dist/index.min.js',
  'dist/index.css',
  'dist/css/content-theme/light.css',
  'dist/css/content-theme/dark.css',
  'dist/js/lute',
  'dist/js/i18n/zh_CN.js',
  'dist/js/katex',
  'dist/js/mermaid',
  'dist/js/flowchart.js',
  'dist/js/highlight.js/highlight.min.js',
  'dist/js/highlight.js/third-languages.js',
  'dist/js/highlight.js/styles/github.min.css',
  'dist/js/highlight.js/styles/github-dark.min.css',
  'LICENSE',
];

fs.rmSync(dest, { recursive: true, force: true });
for (const rel of KEEP) {
  fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
  fs.cpSync(path.join(src, rel), path.join(dest, rel), { recursive: true });
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
console.log(`vditor → src/vendor/vditor (${(bytes / 1048576).toFixed(2)} MB)`);
