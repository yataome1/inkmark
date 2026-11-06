const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  theme: 'system',
  recent: [],
  sidebar: { visible: true, tab: 'outline' },
  folder: null,
};

const file = () => path.join(app.getPath('userData'), 'settings.json');
let cache = null;

function get() {
  if (!cache) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
    } catch {
      cache = { ...DEFAULTS };
    }
  }
  return cache;
}

function set(patch) {
  cache = { ...get(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  return cache;
}

function addRecent(p) {
  const recent = [p, ...get().recent.filter((r) => r !== p)].slice(0, 10);
  set({ recent });
}

module.exports = { get, set, addRecent };
