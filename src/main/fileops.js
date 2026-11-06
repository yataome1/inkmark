const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const MD_EXT = new Set(['.md', '.markdown', '.mdown', '.txt']);

function isMarkdown(p) {
  return MD_EXT.has(path.extname(p).toLowerCase());
}

function readFile(p) {
  return { path: p, content: fs.readFileSync(p, 'utf8') };
}

// 原子写入：先写临时文件再替换（宪章 IV）
function writeFileAtomic(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, p);
}

function listDir(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && d.name !== 'node_modules')
    .filter((d) => d.isDirectory() || isMarkdown(d.name))
    .map((d) => ({ name: d.name, path: path.join(dir, d.name), dir: d.isDirectory() }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'zh-CN') : a.dir ? -1 : 1));
}

function uniqueName(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = name;
  for (let i = 1; fs.existsSync(path.join(dir, candidate)); i++) candidate = `${base}-${i}${ext}`;
  return candidate;
}

// 返回插入到 Markdown 中的图片路径（FR-011）
function saveImage(docPath, name, bytes) {
  const safe = name.replace(/[\\/:*?"<>|\s]+/g, '-') || 'image.png';
  const stamped = /^image\.\w+$/i.test(safe) ? `image-${Date.now()}${path.extname(safe)}` : safe;
  if (docPath) {
    const dir = path.join(path.dirname(docPath), 'assets');
    fs.mkdirSync(dir, { recursive: true });
    const file = uniqueName(dir, stamped);
    fs.writeFileSync(path.join(dir, file), Buffer.from(bytes));
    return `assets/${file}`;
  }
  const dir = path.join(os.tmpdir(), 'inkmark-images');
  fs.mkdirSync(dir, { recursive: true });
  const file = uniqueName(dir, stamped);
  fs.writeFileSync(path.join(dir, file), Buffer.from(bytes));
  return pathToFileURL(path.join(dir, file)).href;
}

module.exports = { isMarkdown, readFile, writeFileAtomic, listDir, saveImage };
