// 许可策略（specs/010）：解析 SPDX 表达式，选出可用的许可组合；GPL 类或未知许可抛错。
const PERMISSIVE = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'Zlib',
  'Unlicense',
  'CC0-1.0',
  'Unicode-3.0',
  'PSF-2.0',
]);
// 弱著佐权：未修改时只需注明许可并告知源码获取地址
const WEAK = new Set(['MPL-2.0', 'EPL-2.0']);

/** 解析为“或”的列表，每项是需同时满足的许可数组 */
export function parse(expression) {
  const tokens = expression.replace(/\//g, ' OR ').match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const factor = () => {
    const t = tokens[i++];
    if (t === '(') {
      const inner = or();
      if (tokens[i++] !== ')') throw new Error(`括号不匹配：${expression}`);
      return inner;
    }
    if (!t || t === ')' || t === 'AND' || t === 'OR') throw new Error(`无法解析：${expression}`);
    return [[t]];
  };
  const and = () => {
    let result = factor();
    while (tokens[i] === 'AND') {
      i++;
      const right = factor();
      result = result.flatMap((a) => right.map((b) => [...a, ...b]));
    }
    return result;
  };
  const or = () => {
    let result = and();
    while (tokens[i] === 'OR') {
      i++;
      result = [...result, ...and()];
    }
    return result;
  };
  const result = or();
  if (i !== tokens.length) throw new Error(`无法解析：${expression}`);
  return result;
}

/** 选出许可组合：宽松优先，其次含弱著佐权；返回 { chosen, weak }，没有可用组合时抛错 */
export function choose(expression) {
  const options = parse(expression);
  const allowed = (set) => (option) => option.every((id) => set.has(id));
  const permissive = options.find(allowed(PERMISSIVE));
  if (permissive) return { chosen: permissive.join(' AND '), weak: false };
  const usable = options.find(allowed(new Set([...PERMISSIVE, ...WEAK])));
  if (usable) return { chosen: usable.join(' AND '), weak: true };
  throw new Error(`许可不在允许范围内：${expression}`);
}

export function sourceUrl({ source, name, version }) {
  return source === 'cargo' ? `https://crates.io/crates/${name}/${version}` : `https://www.npmjs.com/package/${name}/v/${version}`;
}
