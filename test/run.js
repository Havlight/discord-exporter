"use strict";
// Plain node assertions over the pure logic — no browser needed.
const assert = require("assert");
const { timeToSnowflake, timeToSnowflakeCeil, snowflakeToTime } = require("../src/lib/snowflake.js");
const { toJson, toCsv, toTxt, toHtml } = require("../src/lib/formatters.js");

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass++;
  console.log("  ok -", name);
};

// --- snowflake ---
ok("time -> snowflake -> time round-trips to the second", () => {
  const ms = Date.UTC(2024, 0, 15, 12, 30, 0);
  const sf = timeToSnowflake(ms);
  assert.strictEqual(snowflakeToTime(sf), ms);
});
ok("ceil snowflake sits at the top of the millisecond", () => {
  const ms = Date.UTC(2024, 0, 15, 12, 30, 0);
  assert.ok(BigInt(timeToSnowflakeCeil(ms)) > BigInt(timeToSnowflake(ms)));
  assert.strictEqual(snowflakeToTime(timeToSnowflakeCeil(ms)), ms);
});
ok("pre-epoch times clamp to 0", () => {
  assert.strictEqual(timeToSnowflake(0), "0");
  assert.strictEqual(timeToSnowflakeCeil(0), "0");
});

// --- formatters ---
const ctx = {
  guild: { id: "1", name: "My <Server>" },
  channel: { id: "100", name: "general", type: 0 },
  messages: [
    {
      id: "2000",
      timestamp: "2024-01-15T12:30:00.000Z",
      edited_timestamp: null,
      author: { id: "9", username: "alice", global_name: "Alice" },
      content: 'hi, "quoted", line\nbreak',
      attachments: [{ filename: "pic.png", url: "https://cdn/pic.png" }],
      embeds: [],
    },
    {
      id: "2001",
      timestamp: "2024-01-15T12:31:00.000Z",
      edited_timestamp: "2024-01-15T12:32:00.000Z",
      author: { id: "10", username: "bob", discriminator: "0" },
      content: "<script>alert(1)</script>",
      attachments: [],
      embeds: [{ title: "T", description: "D", url: "https://x/y" }],
    },
  ],
};

ok("JSON round-trips and keeps message count", () => {
  const o = JSON.parse(toJson(ctx));
  assert.strictEqual(o.messageCount, 2);
  assert.strictEqual(o.messages[1].id, "2001");
});
ok("CSV has header + one row per message, quotes escaped", () => {
  const rows = toCsv(ctx).split("\r\n");
  assert.strictEqual(rows.length, 3);
  assert.ok(rows[0].startsWith("id,timestamp"));
  assert.ok(rows[1].includes('""quoted""')); // doubled quotes
});
ok("TXT shows author, edited marker and attachment", () => {
  const t = toTxt(ctx);
  assert.ok(t.includes("Alice"));
  assert.ok(t.includes("(已編輯)"));
  assert.ok(t.includes("[附件: pic.png]"));
});
ok("HTML escapes content and keeps structure", () => {
  const h = toHtml(ctx);
  assert.ok(h.includes("&lt;script&gt;"), "script tag must be escaped");
  assert.ok(!h.includes("<script>alert"), "raw script must not appear");
  assert.ok(h.includes("My &lt;Server&gt; / #general"));
  assert.ok(h.includes('<img src="https://cdn/pic.png"'));
});

// --- injected session discovery and user-facing diagnostics ---
require("./session.js")(ok);

console.log(`\n${pass} tests passed.`);
