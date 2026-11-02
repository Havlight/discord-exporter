"use strict";

const assert = require("assert");
const vm = require("vm");
const { readTokenInPage, tokenErrorMessage } = require("../src/lib/session.js");

// Like Discord's chunk handlers, the newest runtime calls the callback first,
// then forwards the same chunk to the previously installed handler.
function chunkFor(runtimes) {
  const chunk = [];
  for (const runtime of runtimes) {
    const previousPush = chunk.push.bind(chunk);
    chunk.push = (entry) => {
      const result = entry[2](runtime);
      previousPush(entry);
      return result;
    };
  }
  return chunk;
}

const runtimeFor = (...exports) => ({ c: Object.fromEntries(exports.map((exp, id) => [id, { exports: exp }])) });
const store = (value) => ({ getToken() { return value; }, isAuthenticated() { return true; } });
function read(chunk) {
  // Simulate executeScript serialization: no module scope or extension APIs
  // are available inside the injected function, only the page's window.
  const result = vm.runInNewContext(`(${readTokenInPage.toString()})()`, {
    window: { webpackChunkdiscord_app: chunk },
  }, { timeout: 1000 });
  return JSON.parse(JSON.stringify(result));
}

module.exports = (ok) => {
  ok("main runtime remains searchable before a helper with 98 unrelated modules", () => {
    const helper = runtimeFor(...Array.from({ length: 98 }, () => ({})));
    const main = runtimeFor({ default: store("test-session") });
    const chunk = chunkFor([helper, {}, {}, main]);
    const result = read(chunk);
    assert.strictEqual(result.reason, "ok");
    assert.strictEqual(result.token, "test-session");
    assert.strictEqual(result.runtimes, 4);
    assert.strictEqual(chunk.length, 0);
  });

  ok("search reaches a later runtime even when module IDs overlap", () => {
    const main = runtimeFor({ renamedExport: store("test-session") });
    const helper = runtimeFor({}); // both caches have module ID 0
    const result = read(chunkFor([main, helper, {}]));
    assert.strictEqual(result.token, "test-session");
    assert.strictEqual(result.caches, 2);
    assert.strictEqual(result.modules, 2);
  });

  ok("duplicate callbacks and shared caches are counted once", () => {
    let reads = 0;
    const emptyStore = { getToken() { reads++; return null; }, isAuthenticated() {} };
    const runtime = runtimeFor({ first: emptyStore, alias: emptyStore });
    const result = read(chunkFor([runtime, runtime, { c: runtime.c }, {}]));
    assert.strictEqual(result.reason, "token-unavailable");
    assert.strictEqual(result.runtimes, 3);
    assert.strictEqual(result.caches, 1);
    assert.strictEqual(result.modules, 1);
    assert.strictEqual(result.withGetToken, 1);
    assert.strictEqual(result.stores, 1);
    assert.strictEqual(reads, 1);
  });

  ok("missing auth store has aggregate diagnostics without claiming logout", () => {
    const tokenOnly = { getToken() { throw new Error("must not be called"); } };
    const result = read(chunkFor([runtimeFor(tokenOnly), {}, runtimeFor({}, {})]));
    assert.strictEqual(result.reason, "store-not-found");
    assert.strictEqual(result.modules, 3);
    assert.strictEqual(result.withGetToken, 1);
    assert.strictEqual(result.stores, 0);
    const message = tokenErrorMessage(result);
    assert.ok(message.includes("無法判定登入狀態"));
    assert.ok(message.includes("3 個 runtime"));
    assert.ok(message.includes("2 組模組快取、3 個模組"));
    assert.ok(!message.includes("請確認登入"));
  });

  ok("empty or non-string tokens are distinct from a missing store", () => {
    for (const value of [null, undefined, "", "   ", {}, 123]) {
      const result = read(chunkFor([runtimeFor(store(value))]));
      assert.strictEqual(result.reason, "token-unavailable");
      assert.strictEqual(result.token, null);
      assert.ok(tokenErrorMessage(result).includes("已找到 Discord 登入模組"));
    }
  });

  ok("empty and throwing candidates do not hide a valid export in the same module", () => {
    const throwingStore = { getToken() { throw new Error("private details"); }, isAuthenticated() {} };
    const result = read(chunkFor([runtimeFor({
      empty: store(null), broken: throwingStore, valid: store("test-session"),
    })]));
    assert.strictEqual(result.token, "test-session");
    assert.strictEqual(result.stores, 3);
  });

  ok("unreadable cache and throwing module/export getters do not stop other runtimes", () => {
    const brokenRuntime = { get c() { throw new Error("unavailable"); } };
    const brokenExports = { get getToken() { throw new Error("unavailable"); } };
    const siblingExports = { get broken() { throw new Error("unavailable"); }, valid: store("test-session") };
    const badModules = { c: { get broken() { throw new Error("unavailable"); } } };
    const result = read(chunkFor([
      runtimeFor(siblingExports), runtimeFor(brokenExports), badModules, brokenRuntime,
    ]));
    assert.strictEqual(result.token, "test-session");
  });

  ok("store methods retain their receiver and can live on the prototype", () => {
    class AuthStore {
      constructor() { this.value = "test-session"; }
      getToken() { return this.value; }
      isAuthenticated() { return true; }
    }
    assert.strictEqual(read(chunkFor([runtimeFor(new AuthStore())])).token, "test-session");
  });

  ok("token read exceptions have a separate reason and never leak page error details", () => {
    const broken = { getToken() { throw new Error("sensitive-test-detail"); }, isAuthenticated() {} };
    const result = read(chunkFor([runtimeFor(broken)]));
    assert.strictEqual(result.reason, "token-read-failed");
    assert.ok(tokenErrorMessage(result).includes("讀取登入權杖時發生錯誤"));
    assert.ok(!JSON.stringify(result).includes("sensitive-test-detail"));
    assert.ok(!tokenErrorMessage(result).includes("sensitive-test-detail"));
  });

  ok("missing runtime entry and absent caches have distinct errors", () => {
    assert.strictEqual(read(undefined).reason, "no-webpack");
    assert.strictEqual(read([]).reason, "no-cache");
    const result = read(chunkFor([{}, {}]));
    assert.strictEqual(result.reason, "no-cache");
    assert.strictEqual(result.runtimes, 2);
    assert.strictEqual(result.caches, 0);
  });

  ok("probe cleanup preserves unrelated chunks even if push throws", () => {
    const existing = ["existing"], appended = ["appended"];
    const chunk = [existing];
    chunk.push = (probe) => {
      Array.prototype.push.call(chunk, probe, appended);
      throw new Error("page error");
    };
    assert.strictEqual(read(chunk).reason, "push-failed");
    assert.deepStrictEqual(Array.from(chunk), [existing, appended]);
  });

  ok("a later runtime throwing during push does not discard an already captured cache", () => {
    const chunk = [];
    chunk.push = (probe) => {
      probe[2](runtimeFor(store("test-session")));
      throw new Error("helper failed");
    };
    assert.strictEqual(read(chunk).token, "test-session");
  });
};
