"use strict";

// Each formatter takes { channel, guild, messages } and returns a string.
// `messages` are oldest-first, in the raw shape Discord's API returns.

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function authorName(m) {
  const u = m.author || {};
  return u.global_name || u.username || "unknown";
}

function authorTag(m) {
  const u = m.author || {};
  if (u.discriminator && u.discriminator !== "0") return `${u.username}#${u.discriminator}`;
  return u.username || "unknown";
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Join the parts of a message into one readable text line (content + attachments + embeds).
function messageText(m) {
  const parts = [];
  if (m.content) parts.push(m.content);
  for (const a of m.attachments || []) parts.push(`[附件: ${a.filename || a.url}] ${a.url}`);
  for (const e of m.embeds || []) {
    const bits = [e.title, e.description, e.url].filter(Boolean);
    if (bits.length) parts.push(`[嵌入: ${bits.join(" | ")}]`);
  }
  if (m.sticker_items?.length) parts.push(`[貼圖: ${m.sticker_items.map((s) => s.name).join(", ")}]`);
  return parts.join("\n");
}

function headerLabel(ctx) {
  const g = ctx.guild?.name;
  const c = ctx.channel?.name;
  if (g && c) return `${g} / #${c}`;
  if (c) return c;
  return ctx.channel?.id ? `channel ${ctx.channel.id}` : "Direct Messages";
}

function toTxt(ctx) {
  const lines = [`== ${headerLabel(ctx)} ==`, `匯出時間: ${fmtTime(new Date().toISOString())}`, `訊息數: ${ctx.messages.length}`, ""];
  for (const m of ctx.messages) {
    const edited = m.edited_timestamp ? " (已編輯)" : "";
    lines.push(`[${fmtTime(m.timestamp)}] ${authorName(m)}${edited}`);
    const body = messageText(m);
    if (body) lines.push(body);
    lines.push("");
  }
  return lines.join("\n");
}

function csvCell(s) {
  const v = String(s ?? "");
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(ctx) {
  const rows = [["id", "timestamp", "edited_timestamp", "author_id", "author", "author_tag", "content", "attachments", "embeds", "reply_to"].join(",")];
  for (const m of ctx.messages) {
    rows.push(
      [
        m.id,
        m.timestamp || "",
        m.edited_timestamp || "",
        m.author?.id || "",
        authorName(m),
        authorTag(m),
        m.content || "",
        (m.attachments || []).map((a) => a.url).join(" "),
        (m.embeds || []).map((e) => e.url || e.title || "").join(" "),
        m.referenced_message?.id || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\r\n");
}

function toJson(ctx) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      guild: ctx.guild || null,
      channel: ctx.channel || null,
      messageCount: ctx.messages.length,
      messages: ctx.messages,
    },
    null,
    2,
  );
}

function toHtml(ctx) {
  const body = ctx.messages
    .map((m) => {
      const edited = m.edited_timestamp ? ` <span class="edited">(已編輯)</span>` : "";
      const attach = (m.attachments || [])
        .map((a) => {
          if (/\.(png|jpe?g|gif|webp)$/i.test(a.filename || a.url || "")) {
            return `<div class="attach"><a href="${esc(a.url)}" target="_blank" rel="noreferrer"><img src="${esc(a.url)}" alt="${esc(a.filename)}"></a></div>`;
          }
          return `<div class="attach"><a href="${esc(a.url)}" target="_blank" rel="noreferrer">📎 ${esc(a.filename || a.url)}</a></div>`;
        })
        .join("");
      const embeds = (m.embeds || [])
        .map((e) => {
          const t = e.title ? `<div class="etitle">${esc(e.title)}</div>` : "";
          const d = e.description ? `<div class="edesc">${esc(e.description)}</div>` : "";
          const u = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.url)}</a>` : "";
          return `<div class="embed">${t}${d}${u}</div>`;
        })
        .join("");
      const content = m.content ? `<div class="content">${esc(m.content).replace(/\n/g, "<br>")}</div>` : "";
      return `<div class="msg">
        <div class="meta"><span class="author">${esc(authorName(m))}</span><span class="ts">${esc(fmtTime(m.timestamp))}</span>${edited}</div>
        ${content}${attach}${embeds}
      </div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<title>${esc(headerLabel(ctx))} — Discord 匯出</title>
<style>
  body{background:#313338;color:#dbdee1;font-family:"gg sans","Segoe UI",system-ui,sans-serif;margin:0;padding:24px;line-height:1.4}
  h1{font-size:18px;color:#fff;border-bottom:1px solid #3f4147;padding-bottom:12px}
  .info{color:#949ba4;font-size:13px;margin-bottom:20px}
  .msg{padding:8px 0;border-top:1px solid #35373c}
  .meta{display:flex;gap:10px;align-items:baseline}
  .author{font-weight:600;color:#f2f3f5}
  .ts{color:#949ba4;font-size:12px}
  .edited{color:#949ba4;font-size:11px}
  .content{margin-top:2px;white-space:pre-wrap;word-break:break-word}
  .attach img{max-width:420px;max-height:320px;border-radius:6px;margin-top:6px}
  .attach a{color:#00a8fc;text-decoration:none}
  .embed{border-left:4px solid #4f545c;background:#2b2d31;padding:8px 12px;margin-top:6px;border-radius:4px}
  .etitle{font-weight:600;color:#fff}
  .edesc{color:#dbdee1;font-size:14px;white-space:pre-wrap}
  a{color:#00a8fc}
</style></head>
<body>
<h1>${esc(headerLabel(ctx))}</h1>
<div class="info">匯出時間 ${esc(fmtTime(new Date().toISOString()))} · 共 ${ctx.messages.length} 則訊息</div>
${body}
</body></html>`;
}

const FORMATTERS = {
  html: { ext: "html", mime: "text/html;charset=utf-8", run: toHtml },
  json: { ext: "json", mime: "application/json;charset=utf-8", run: toJson },
  txt: { ext: "txt", mime: "text/plain;charset=utf-8", run: toTxt },
  csv: { ext: "csv", mime: "text/csv;charset=utf-8", run: toCsv },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { FORMATTERS, toHtml, toJson, toTxt, toCsv };
} else {
  globalThis.FORMATTERS = FORMATTERS;
}
