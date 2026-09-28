import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const publicRoot = new URL('../public/', import.meta.url);
const source = readFileSync(new URL('sw.js', publicRoot), 'utf8');
const version = source.match(/const VERSION = "([^"]+)"/)[1];

function worker({ base = '/', fail = false } = {}) {
  const handlers = {};
  const state = { skipped: false, claimed: false, deleted: [], errors: [], shell: [] };
  const self = {
    registration: { scope: `https://example.test${base}` },
    location: { origin: 'https://example.test' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: async () => { state.skipped = true; },
    clients: { claim: async () => { state.claimed = true; } },
  };
  runInNewContext(source, {
    self, URL, Request, Response,
    console: { error: (...args) => state.errors.push(args) },
    caches: {
      open: async () => ({ addAll: async (paths) => {
        state.shell = Array.from(paths);
        if (fail) throw new Error('Network unavailable');
      } }),
      keys: async () => ['wisebudget-static-old', 'wisebudget-dynamic-old',
        `wisebudget-static-${version}`, `wisebudget-dynamic-${version}`, 'another-app-cache'],
      delete: async (key) => { state.deleted.push(key); return true; },
    },
  });
  const dispatch = (name, extra = {}) => {
    let pending;
    handlers[name]({ ...extra, waitUntil: (promise) => { pending = promise; } });
    return pending;
  };
  return { state, dispatch, handlers };
}

test('precache contains existing assets, every router screen and its local imports', async () => {
  const { state, dispatch } = worker();
  await dispatch('install');
  assert.equal(state.skipped, true);
  for (const path of state.shell) {
    assert.ok(existsSync(new URL(path === '/' ? 'index.html' : path.slice(1), publicRoot)), path);
  }
  const main = readFileSync(new URL('main.js', publicRoot), 'utf8');
  for (const [, path] of main.matchAll(/(?:file|js):\s*"([^"]+)"/g)) {
    assert.ok(state.shell.includes(path), `Missing router asset: ${path}`);
  }
  for (const path of state.shell.filter((path) => path.endsWith('.js') && path !== '/sw.js')) {
    const code = readFileSync(new URL(path.slice(1), publicRoot), 'utf8');
    for (const [, dependency] of code.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g)) {
      const resolved = new URL(dependency, `https://example.test${path}`).pathname;
      assert.ok(state.shell.includes(resolved), `${path} needs ${resolved}`);
    }
  }
});

test('failed precache rejects installation and does not skip waiting', async () => {
  const { state, dispatch } = worker({ fail: true });
  await assert.rejects(dispatch('install'), /Network unavailable/);
  assert.equal(state.skipped, false);
  assert.equal(state.errors.length, 1);
});

test('activation preserves current and unrelated caches', async () => {
  const { state, dispatch } = worker();
  await dispatch('activate');
  assert.deepEqual(state.deleted, ['wisebudget-static-old', 'wisebudget-dynamic-old']);
  assert.equal(state.claimed, true);
});

test('precache respects deployment in a subdirectory', async () => {
  const { state, dispatch } = worker({ base: '/budget/' });
  await dispatch('install');
  assert.ok(state.shell.every((path) => path.startsWith('/budget/')));
});

test('financial API requests and writes are not intercepted', () => {
  const { handlers } = worker();
  for (const request of [
    new Request('https://database.example/rest/v1/transactions'),
    new Request('https://example.test/transactions', { method: 'POST' }),
  ]) {
    handlers.fetch({ request, respondWith: () => assert.fail('Request intercepted') });
  }
});
