"use strict";

// Injected into discord.com. The popup hands us the session token (read in the
// page's MAIN world) and a time window; we page through the current channel's
// messages via the API, build the files and pass them to the background for
// download. Running here rather than in the popup means the export keeps going
// even if the popup closes.
//
// NOTE: this drives a user account through the private API, which Discord's
// Terms of Service forbid for automation. Use it only on your own account and
// your own data, at your own risk.

let busy = false;

// Parse /channels/{guild|@me}/{channel}[/threads/{id}] from the current URL.
function parseLocation() {
  const m = location.pathname.match(/^\/channels\/(@me|\d+)\/(\d+)(?:\/threads\/(\d+))?/);
  if (!m) return null;
  return { guildId: m[1] === "@me" ? null : m[1], channelId: m[3] || m[2], isDM: m[1] === "@me" };
}

// Small status badge in the page, so progress is visible after the popup closes.
let toastEl = null;
function toast(text, state = "busy") {
  if (!toastEl) {
    toastEl = document.createElement("div");
    Object.assign(toastEl.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647,
      padding: "10px 14px", borderRadius: "8px", font: "13px system-ui, sans-serif",
      color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,.4)", maxWidth: "320px",
    });
    document.body.appendChild(toastEl);
  }
  toastEl.style.background = state === "err" ? "#a12d2f" : state === "ok" ? "#23794b" : "#5865f2";
  toastEl.textContent = text;
  if (state !== "busy") {
    const el = toastEl;
    toastEl = null;
    setTimeout(() => el.remove(), 6000);
  }
}

async function api(path, token) {
  const url = `https://discord.com/api/v9${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: token } });
    if (res.status === 429 || (res.status >= 500 && attempt < 3)) {
      const retry = Number(res.headers.get("retry-after") || 1);
      await new Promise((r) => setTimeout(r, (retry + 0.5) * 1000));
      continue;
    }
    if (res.status === 401) throw new Error("權杖無效，請重新整理 Discord 後再試。");
    if (res.status === 403) throw new Error("沒有讀取這個頻道訊息紀錄的權限。");
    if (res.status === 404) throw new Error("找不到頻道。");
    if (!res.ok) throw new Error(`Discord API 錯誤：${res.status}`);
    return res.json();
  }
}

async function fetchContext(loc, token) {
  const ch = await api(`/channels/${loc.channelId}`, token);
  let guild = null;
  if (ch.guild_id) {
    try {
      const g = await api(`/guilds/${ch.guild_id}`, token);
      guild = { id: g.id, name: g.name };
    } catch (_) {}
  }
  const name = ch.name || (ch.recipients ? ch.recipients.map((r) => r.global_name || r.username).join(", ") : null);
  return { channel: { id: ch.id, name, type: ch.type }, guild };
}

const byId = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

// Page forward through [afterMs, beforeMs], 100 messages per request.
async function fetchMessages(loc, token, afterMs, beforeMs, onProgress) {
  const last = BigInt(timeToSnowflakeCeil(beforeMs));
  let after = timeToSnowflake(afterMs);
  const out = [];
  while (true) {
    const batch = await api(`/channels/${loc.channelId}/messages?limit=100&after=${after}`, token);
    if (!Array.isArray(batch) || batch.length === 0) break;
    // The API returns newest-first; walk oldest-first via the `after` cursor.
    batch.sort(byId);
    for (const m of batch) if (BigInt(m.id) <= last) out.push(m);
    const newest = batch[batch.length - 1];
    onProgress(out.length);
    if (BigInt(newest.id) >= last || batch.length < 100) break;
    after = newest.id;
    await new Promise((r) => setTimeout(r, 250)); // stay well under rate limits
  }
  return out;
}

function safeName(s) {
  return String(s || "discord").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 80);
}

function rangeLabel(afterMs, beforeMs) {
  const p = (n) => String(n).padStart(2, "0");
  const f = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };
  return `${f(afterMs)}_${f(beforeMs)}`;
}

async function runExport({ token, afterMs, beforeMs, formats }) {
  const loc = parseLocation();
  if (!loc) throw new Error("請先在 Discord 開啟一個頻道或私訊。");
  toast("讀取頻道資訊…");
  const ctx = await fetchContext(loc, token);
  const messages = await fetchMessages(loc, token, afterMs, beforeMs, (n) => {
    toast(`已取得 ${n} 則訊息…`);
    browser.runtime.sendMessage({ type: "dcx-progress", count: n }).catch(() => {});
  });
  if (messages.length === 0) return { count: 0, files: 0 };

  const data = { ...ctx, range: { after: new Date(afterMs).toISOString(), before: new Date(beforeMs).toISOString() }, messages };
  const base = safeName(`${ctx.guild?.name ? ctx.guild.name + " - " : ""}${ctx.channel.name || ctx.channel.id}`);
  for (const fmt of formats) {
    const f = FORMATTERS[fmt];
    if (!f) continue;
    const res = await browser.runtime.sendMessage({
      type: "dcx-download",
      content: f.run(data),
      mime: f.mime,
      filename: `${base} [${rangeLabel(afterMs, beforeMs)}].${f.ext}`,
    });
    if (!res?.ok) throw new Error(res?.error || "下載失敗");
  }
  return { count: messages.length, files: formats.length };
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "dcx-detect") return Promise.resolve({ loc: parseLocation(), busy });
  if (msg?.type !== "dcx-export") return;
  if (busy) return Promise.resolve({ ok: false, error: "已有匯出正在進行中。" });
  busy = true;
  return runExport(msg)
    .then((r) => {
      toast(r.count ? `完成：${r.count} 則訊息，${r.files} 個檔案` : "這個時間範圍內沒有訊息。", r.count ? "ok" : "err");
      return { ok: true, ...r };
    })
    .catch((err) => {
      const error = String(err?.message || err);
      toast("匯出失敗：" + error, "err");
      return { ok: false, error };
    })
    .finally(() => {
      busy = false;
    });
});
