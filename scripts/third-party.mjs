// 生成第三方声明（specs/009 FR-905）：前端取 package-lock 的生产依赖，Rust 取 Windows x64 的 normal 依赖。
// 缺少许可信息且不在例外表中时抛错，让 npm run vendor 失败。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { choose, sourceUrl } from './license-policy.mjs';

const TEXT_FILE = /^(licen[cs]e|copying|notice)/i;
const STANDARD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'license-texts');

// 只含 2026-11 调研发现的包（plan.md）；新增依赖不会自动进入
const NPM_LICENSE = { khroma: 'MIT' };
const CARGO_TEXT = {
  'alloc-stdlib': 'BSD-3-Clause',
  selectors: 'MPL-2.0',
  'webview2-com': 'MIT',
  'webview2-com-macros': 'MIT',
  'webview2-com-sys': 'MIT',
};

function readTexts(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && TEXT_FILE.test(e.name))
    .map((e) => fs.readFileSync(path.join(dir, e.name), 'utf8').replace(/\r\n/g, '\n').trim());
}

function standardText(id, authors) {
  const copyright = `Copyright (c) ${authors.join(', ').replace(/\s*<[^>]*>/g, '')}`;
  return fs
    .readFileSync(path.join(STANDARD, `${id}.txt`), 'utf8')
    .replace('{copyright}', copyright)
    .trim();
}

function npmPackages(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages;
  return Object.entries(lock)
    .filter(([key, info]) => key && !info.dev && !info.optional)
    .map(([key, info]) => {
      const dir = path.join(root, key);
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
      const license = pkg.license?.type ?? pkg.license ?? pkg.licenses?.map((l) => l.type).join(' OR ') ?? NPM_LICENSE[name];
      return { name, version: info.version, license, source: 'npm', texts: readTexts(dir) };
    });
}

function cargoPackages(root) {
  const output = execSync('cargo metadata --format-version 1 --locked --filter-platform x86_64-pc-windows-msvc', {
    cwd: path.join(root, 'src-tauri'),
    maxBuffer: 1 << 30,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const meta = JSON.parse(output.toString());
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const packages = new Map(meta.packages.map((p) => [p.id, p]));
  const reached = new Set();
  const visit = (id) => {
    if (reached.has(id)) return;
    reached.add(id);
    for (const dep of nodes.get(id).deps) if (dep.dep_kinds.some((k) => k.kind === null)) visit(dep.pkg);
  };
  visit(meta.resolve.root);
  reached.delete(meta.resolve.root);
  return [...reached].map((id) => {
    const p = packages.get(id);
    let texts = readTexts(path.dirname(p.manifest_path));
    if (!texts.length && CARGO_TEXT[p.name]) texts = [standardText(CARGO_TEXT[p.name], p.authors)];
    return { name: p.name, version: p.version, license: p.license, source: 'cargo', texts };
  });
}

export function writeThirdParty(root, outFile) {
  const all = [...npmPackages(root), ...cargoPackages(root)].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  const missing = all.filter((p) => !p.license || !p.texts.length).map((p) => `${p.source}:${p.name}@${p.version}`);
  if (missing.length) throw new Error(`缺少许可信息：\n${missing.join('\n')}`);
  // specs/010：按允许列表选定许可，弱著佐权记录源码地址
  const rejected = [];
  for (const p of all) {
    try {
      const { chosen, weak } = choose(p.license);
      p.chosen = chosen;
      if (weak) p.sourceUrl = sourceUrl(p);
    } catch {
      rejected.push(`${p.source}:${p.name}@${p.version}  ${p.license}`);
    }
  }
  if (rejected.length) throw new Error(`许可不在允许范围内（GPL 类或未知许可）：\n${rejected.join('\n')}`);
  const texts = [];
  const index = new Map();
  const packages = all.map((p) => ({
    ...p,
    texts: p.texts.map((text) => {
      if (!index.has(text)) {
        index.set(text, texts.length);
        texts.push(text);
      }
      return index.get(text);
    }),
  }));
  fs.writeFileSync(outFile, JSON.stringify({ texts, packages }));
  return packages.length;
}
