"use strict";

// executeScript serializes this function into the page's MAIN world, so keep
// every dependency inside it. Never include tokens or page exceptions in diagnostics.
function readTokenInPage() {
  const chunk = window.webpackChunkdiscord_app;
  if (!Array.isArray(chunk)) return { token: null, reason: "no-webpack" };

  // Discord chains multiple runtimes onto the same chunk array. The callback
  // runs once per runtime; keeping only its last argument loses the main cache.
  const runtimes = new Set();
  const probe = [[Symbol("dcx")], {}, (req) => { runtimes.add(req); }];
  let pushFailed = false;
  try {
    chunk.push(probe);
  } catch (_) {
    pushFailed = true;
  } finally {
    // Remove only our probe, even if a runtime appended another chunk or threw.
    const index = chunk.indexOf(probe);
    if (index !== -1) chunk.splice(index, 1);
  }

  const stats = { runtimes: runtimes.size, caches: 0, modules: 0, withGetToken: 0, stores: 0 };
  const result = (reason, token = null) => ({ token, reason, ...stats });
  const seenCaches = new Set();
  const seenObjects = new Set();
  let tokenReadFailed = false;
  const isObject = (obj) => obj && (typeof obj === "object" || typeof obj === "function");
  const readStore = (obj) => {
    if (!isObject(obj) || seenObjects.has(obj)) return null;
    seenObjects.add(obj);
    let getToken;
    try {
      getToken = obj.getToken;
      if (typeof getToken !== "function") return null;
      stats.withGetToken++;
      if (typeof obj.isAuthenticated !== "function") return null;
    } catch (_) {
      return null; // unrelated exports can have throwing getters
    }
    stats.stores++;
    try {
      const token = getToken.call(obj);
      return typeof token === "string" && token.trim() ? token : null;
    } catch (_) {
      tokenReadFailed = true;
      return null; // another store or runtime may still work
    }
  };

  for (const req of runtimes) {
    let cache;
    try {
      cache = req?.c;
    } catch (_) {
      continue;
    }
    if (!isObject(cache) || seenCaches.has(cache)) continue;
    seenCaches.add(cache);
    stats.caches++;
    for (const id of Object.keys(cache)) {
      let exp;
      try {
        exp = cache[id]?.exports;
      } catch (_) {
        continue;
      }
      if (!exp) continue;
      stats.modules++;
      let token = readStore(exp);
      if (token) return result("ok", token);
      if (!isObject(exp)) continue;
      // Export names vary between builds. Inspect the export itself and its
      // members, and keep searching if one candidate returns an empty token.
      let keys;
      try {
        keys = Object.keys(exp);
      } catch (_) {
        continue;
      }
      for (const key of keys) {
        try {
          token = readStore(exp[key]);
        } catch (_) {
          continue;
        }
        if (token) return result("ok", token);
      }
    }
  }
  if (pushFailed) return result("push-failed");
  if (!stats.caches) return result("no-cache");
  if (tokenReadFailed) return result("token-read-failed");
  return result(stats.stores ? "token-unavailable" : "store-not-found");
}

function tokenErrorMessage(result) {
  const hints = {
    "no-webpack": "無法取得 Discord 頁面的模組入口，請等頁面載入完成後再試。",
    "no-cache": "無法讀取 Discord 的模組快取，請重新整理後再試；若持續發生，可能是頁面結構已更新。",
    "push-failed": "讀取 Discord 模組時發生錯誤，請重新整理後再試。",
    "store-not-found": "未找到可用的 Discord 登入模組，無法判定登入狀態。請等頁面載入完成後再試；若持續發生，可能是頁面結構已更新。",
    "token-unavailable": "已找到 Discord 登入模組，但尚未取得有效的登入權杖。請確認登入完成後再試。",
    "token-read-failed": "已找到 Discord 登入模組，但讀取登入權杖時發生錯誤。請重新整理後再試。",
    "inject-failed": "無法注入頁面，請重新整理 Discord 分頁後再試。",
  };
  let message = hints[result.reason] || "無法取得 Discord 登入資訊。";
  if (Number.isInteger(result.runtimes)) {
    message += `（偵測到 ${result.runtimes} 個 runtime，已掃描 ${result.caches} 組模組快取、${result.modules} 個模組，其中 ${result.withGetToken} 個物件帶 getToken、${result.stores} 個符合登入模組介面）`;
  }
  return message;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { readTokenInPage, tokenErrorMessage };
}
