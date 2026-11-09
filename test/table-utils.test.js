const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/table-utils');

const SAMPLE = '| 名称 | 代码 |\n| :--- | ---: |\n| 甲 | `a \\| b` |\n| 乙 | z \\| w |';

test('displayWidth: 中日韩计 2', () => {
  assert.equal(T.displayWidth('a中'), 3);
});

test('parseTable: 对齐、转义竖线（含行内代码）保持在单元格内', () => {
  const m = T.parseTable(SAMPLE);
  assert.deepEqual(m.align, ['left', 'right']);
  assert.deepEqual(m.rows, [
    ['名称', '代码'],
    ['甲', '`a \\| b`'],
    ['乙', 'z \\| w'],
  ]);
});

test('parseTable: 空单元格、缺少首尾竖线、行内单元格不足时补齐', () => {
  assert.deepEqual(T.parseTable('| a |  | c |\n|-|-|-|\n|  | 2 |').rows, [
    ['a', '', 'c'],
    ['', '2', ''],
  ]);
  assert.deepEqual(T.parseTable('a | b\n--|--\n1 | 2').rows, [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('parseTable + formatTable: 引用块、列表前缀保留', () => {
  const quoted = T.parseTable('> | a |\n> | --- |\n> | 1 |');
  assert.equal(T.formatTable(quoted), '> | a   |\n> | --- |\n> | 1   |');
  const listed = T.parseTable('- | a |\n  | --- |\n  | 1 |');
  assert.equal(T.formatTable(listed), '- | a   |\n  | --- |\n  | 1   |');
});

test('formatTable: 按显示宽度与对齐方式排版', () => {
  assert.equal(
    T.formatTable(T.parseTable('| 名称 | b | c |\n| :-: | --: | --- |\n| x | yy | 中文字 |')),
    '| 名称  |    b | c      |\n| :---: | ---: | ------ |\n|   x   |   yy | 中文字 |'.replace('| 名称  |', '| 名称  |'),
  );
});

test('排版后再解析内容不变', () => {
  const m = T.parseTable(SAMPLE);
  const again = T.parseTable(T.formatTable(m));
  assert.deepEqual(again.rows, m.rows);
  assert.deepEqual(again.align, m.align);
});

const base = () => T.parseTable('| h1 | h2 |\n| --- | --- |\n| a | b |\n| c | d |');

test('insertRow: 在指定位置插入空行；表头之上不插入', () => {
  assert.deepEqual(T.insertRow(base(), 2).rows[2], ['', '']);
  assert.equal(T.insertRow(base(), 2).rows.length, 4);
  assert.equal(T.insertRow(base(), 0).rows.length, 3);
});

test('deleteRow: 不能删除表头，至少保留 1 行数据（FR-207）', () => {
  assert.deepEqual(T.deleteRow(base(), 1).rows, [
    ['h1', 'h2'],
    ['c', 'd'],
  ]);
  assert.equal(T.deleteRow(base(), 0).rows.length, 3);
  const two = T.deleteRow(base(), 1);
  assert.equal(T.deleteRow(two, 1).rows.length, 2);
  assert.equal(T.canDeleteRow(two, 1), false);
});

test('moveRow: 表头不参与移动', () => {
  assert.deepEqual(T.moveRow(base(), 1, 2).rows.slice(1), [
    ['c', 'd'],
    ['a', 'b'],
  ]);
  assert.equal(T.moveRow(base(), 0, 1).rows[0][0], 'h1');
  assert.equal(T.moveRow(base(), 1, 0).rows[0][0], 'h1');
});

test('insertCol / deleteCol / moveCol 同步对齐与所有行', () => {
  const aligned = T.setAlign(base(), 1, 'right');
  const ins = T.insertCol(aligned, 1);
  assert.deepEqual(ins.align, [null, null, 'right']);
  assert.deepEqual(ins.rows[1], ['a', '', 'b']);
  const moved = T.moveCol(aligned, 1, 0);
  assert.deepEqual(moved.align, ['right', null]);
  assert.deepEqual(moved.rows[1], ['b', 'a']);
  assert.deepEqual(T.deleteCol(aligned, 0).rows[1], ['b']);
  const one = T.deleteCol(aligned, 0);
  assert.equal(T.canDeleteCol(one), false);
  assert.equal(T.deleteCol(one, 0).align.length, 1);
});

test('resize: 右侧/下方增删，内容保留，不小于表头 + 1 行、1 列', () => {
  const big = T.resize(base(), 4, 3);
  assert.deepEqual(big.rows[3], ['', '', '']);
  assert.deepEqual(big.rows[1], ['a', 'b', '']);
  assert.equal(big.align.length, 3);
  const small = T.resize(base(), 1, 0);
  assert.equal(small.rows.length, 2);
  assert.deepEqual(small.rows[1], ['a']);
});

test('createTable: 空表格是合法 GFM', () => {
  const text = T.formatTable(T.createTable(3, 2));
  assert.equal(text, '|     |     |\n| --- | --- |\n|     |     |\n|     |     |');
  assert.equal(T.parseTable(text).rows.length, 3);
});
