// 由 scripts/icon/*.svg 生成 src-tauri/icons 中 Windows 所需的图标：node scripts/icons.mjs
// 48px 及以上用完整版，16–32px 用简化版；icon.ico 内含 16、24、32、48、64、256 六个尺寸（PNG 编码）。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src-tauri', 'icons');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmark-icons-'));

function render(svg, sizes) {
  const dir = path.join(tmp, path.basename(svg, '.svg'));
  execSync(`npx tauri icon "${path.join(root, 'scripts', 'icon', svg)}" -o "${dir}" -p ${sizes.join(',')}`, { cwd: root, stdio: 'ignore' });
  return Object.fromEntries(
    sizes.map((s) => {
      const file = fs.readdirSync(dir).find((f) => f.startsWith(`${s}x${s}`) && f.endsWith('.png'));
      if (!file) throw new Error(`未生成 ${s}px：${svg}`);
      return [s, fs.readFileSync(path.join(dir, file))];
    }),
  );
}

/** ICO 文件：图标目录 + 各尺寸 PNG 数据 */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(([size, png], i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at);
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(([, png]) => png)]);
}

const full = render('inkmark.svg', [48, 64, 128, 256, 512]);
const small = render('inkmark-small.svg', [16, 24, 32]);
fs.writeFileSync(path.join(out, '32x32.png'), small[32]);
fs.writeFileSync(path.join(out, '128x128.png'), full[128]);
fs.writeFileSync(path.join(out, '128x128@2x.png'), full[256]);
fs.writeFileSync(path.join(out, 'icon.png'), full[512]);
fs.writeFileSync(
  path.join(out, 'icon.ico'),
  ico([
    [16, small[16]],
    [24, small[24]],
    [32, small[32]],
    [48, full[48]],
    [64, full[64]],
    [256, full[256]],
  ]),
);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`icons → ${path.relative(root, out)}`);
