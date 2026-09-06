// A minimal `localStorage` stand-in for tests. The modules under test
// (stats.js, achievements.js, daily.js, backup.js) call the real Web
// Storage API directly — there's no injected dependency to swap in — so
// this just installs something shaped like it on `globalThis` before each
// test. `daily.js`'s pruneOldDailyStates() also does `Object.keys(localStorage)`
// to enumerate stored keys, so stored entries are exposed as real
// enumerable own properties via a Proxy rather than hidden inside a Map.

export function installLocalStorageStub() {
  const store = new Map();
  const target = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };

  const stub = new Proxy(target, {
    ownKeys(t) {
      return [...new Set([...store.keys(), ...Reflect.ownKeys(t)])];
    },
    getOwnPropertyDescriptor(t, prop) {
      if (typeof prop === "string" && store.has(prop)) {
        return { enumerable: true, configurable: true, value: store.get(prop) };
      }
      return Reflect.getOwnPropertyDescriptor(t, prop);
    },
    has(t, prop) {
      return store.has(prop) || Reflect.has(t, prop);
    },
  });

  globalThis.localStorage = stub;
  return stub;
}
