const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../scripts/license-policy.mjs');

test('parse: OR、AND、括号、斜杠', async () => {
  const { parse } = await load();
  assert.deepEqual(parse('MIT OR Apache-2.0'), [['MIT'], ['Apache-2.0']]);
  assert.deepEqual(parse('MIT/Apache-2.0'), [['MIT'], ['Apache-2.0']]);
  assert.deepEqual(parse('(MIT OR Apache-2.0) AND Unicode-3.0'), [
    ['MIT', 'Unicode-3.0'],
    ['Apache-2.0', 'Unicode-3.0'],
  ]);
  assert.throws(() => parse('(MIT OR'));
});

test('choose: 宽松优先，多选一不选 GPL', async () => {
  const { choose } = await load();
  assert.deepEqual(choose('(MPL-2.0 OR Apache-2.0)'), { chosen: 'Apache-2.0', weak: false });
  assert.deepEqual(choose('EPL-2.0 OR GPL-3.0-or-later'), { chosen: 'EPL-2.0', weak: true });
  assert.deepEqual(choose('MPL-2.0'), { chosen: 'MPL-2.0', weak: true });
  assert.deepEqual(choose('BSD-3-Clause AND MIT'), { chosen: 'BSD-3-Clause AND MIT', weak: false });
});

test('choose: GPL 类与未知许可抛错', async () => {
  const { choose } = await load();
  for (const expr of ['GPL-3.0-only', 'AGPL-3.0-or-later', 'LGPL-2.1-only', 'SSPL-1.0', 'MIT AND GPL-2.0-only', 'Some-New-License']) {
    assert.throws(() => choose(expr), /不在允许范围/, expr);
  }
});
