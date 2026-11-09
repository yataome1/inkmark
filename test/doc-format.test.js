const test = require('node:test');
const assert = require('node:assert/strict');
const { split, join } = require('../src/doc-format');

const roundTrip = (text) => join(split(text).body, split(text));

test('split: LF 文件原样', () => {
  assert.deepEqual(split('a\nb\n'), { body: 'a\nb\n', bom: false, eol: '\n' });
});

test('split: CRLF 文件转为 LF 正文并记下换行符', () => {
  assert.deepEqual(split('a\r\nb\r\n'), { body: 'a\nb\n', bom: false, eol: '\r\n' });
});

test('split: 去掉 BOM 并记下', () => {
  assert.deepEqual(split('﻿a'), { body: 'a', bom: true, eol: '\n' });
});

test('split: 混合换行符取占多数的一种', () => {
  assert.equal(split('a\r\nb\r\nc\n').eol, '\r\n');
  assert.equal(split('a\nb\nc\r\n').eol, '\n');
});

test('split: 空文档', () => {
  assert.deepEqual(split(''), { body: '', bom: false, eol: '\n' });
});

test('打开后不编辑保存：逐字符相同', () => {
  for (const text of ['', 'a', 'a\n', 'a\n\n\nb', 'a\r\nb\r\n', '﻿a\r\n', '﻿', '[TOC]\n- [x] 项\n| a |  b|\n']) {
    assert.equal(roundTrip(text), text);
  }
});

test('join: 编辑后的 LF 正文还原为原换行符', () => {
  assert.equal(join('x\ny', { bom: true, eol: '\r\n' }), '﻿x\r\ny');
});
