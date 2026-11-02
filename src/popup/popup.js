"use strict";

const $ = (s) => document.querySelector(s);
const channelEl = $("#channel");
const exportBtn = $("#export");
const statusEl = $("#status");
const gridEl = $("#grid");
const monthEl = $("#month");
const startDateEl = $("#startDate");
const endDateEl = $("#endDate");
const startTimeEl = $("#startTime");
const endTimeEl = $("#endTime");

let activeTabId = null;

function setStatus(text, cls = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

// ---------- Calendar ----------
// Range is held as two local calendar days plus "HH:MM" times. The first click
// on the grid picks a single day; a second click extends it to a range.

const p2 = (n) => String(n).padStart(2, "0");
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a && b && a.getTime() === b.getTime();
const fmtDay = (d) => `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`;

const today = dayOnly(new Date());
let startDay = today;
let endDay = today;
let anchor = null; // set after the first click of a two-click range pick
let viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);

function renderCalendar() {
  monthEl.textContent = `${viewMonth.getFullYear()} 年 ${viewMonth.getMonth() + 1} 月`;
  gridEl.textContent = "";
  for (const w of "日一二三四五六") {
    const h = document.createElement("div");
    h.className = "dow";
    h.textContent = w;
    gridEl.appendChild(h);
  }
  const first = viewMonth.getDay();
  const days = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  for (let i = 0; i < first; i++) gridEl.appendChild(document.createElement("div"));
  for (let n = 1; n <= days; n++) {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), n);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day";
    b.textContent = n;
    if (d > startDay && d < endDay) b.classList.add("in");
    if (sameDay(d, startDay) || sameDay(d, endDay)) b.classList.add("edge");
    if (sameDay(d, today)) b.classList.add("today");
    b.addEventListener("click", () => pickDay(d));
    gridEl.appendChild(b);
  }
  startDateEl.textContent = fmtDay(startDay);
  endDateEl.textContent = fmtDay(endDay);
  $("#pickHint").textContent = anchor ? "再點一天作為結束日（點同一天則只選這天）" : "點一天選單日，再點另一天選範圍";
}

function pickDay(d) {
  if (!anchor) {
    startDay = endDay = anchor = d;
  } else {
    [startDay, endDay] = d < anchor ? [d, anchor] : [anchor, d];
    anchor = null;
  }
  renderCalendar();
}

$("#prev").addEventListener("click", () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  renderCalendar();
});
$("#next").addEventListener("click", () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  renderCalendar();
});

function setRange(start, end) {
  startDay = dayOnly(start);
  endDay = dayOnly(end);
  startTimeEl.value = `${p2(start.getHours())}:${p2(start.getMinutes())}`;
  endTimeEl.value = `${p2(end.getHours())}:${p2(end.getMinutes())}`;
  anchor = null;
  viewMonth = new Date(endDay.getFullYear(), endDay.getMonth(), 1);
  renderCalendar();
}

function applyRange(kind) {
  const now = new Date();
  const startOfToday = dayOnly(now);
  const endOfToday = new Date(startOfToday.getTime() + (24 * 60 - 1) * 60000);
  if (kind === "today") setRange(startOfToday, endOfToday);
  else if (kind === "yesterday") {
    const y = new Date(startOfToday);
    y.setDate(y.getDate() - 1);
    setRange(y, new Date(y.getTime() + (24 * 60 - 1) * 60000));
  } else if (kind === "24h") setRange(new Date(now.getTime() - 24 * 3600e3), now);
  else if (kind === "7d") setRange(new Date(now.getTime() - 7 * 24 * 3600e3), now);
  else if (kind === "all") setRange(new Date(2015, 0, 1), endOfToday); // before Discord existed
}

document.querySelectorAll(".quick button").forEach((b) => {
  b.addEventListener("click", () => applyRange(b.dataset.range));
});

// Combine a calendar day with an "HH:MM" value. The end time includes its whole minute.
function rangeMs() {
  const at = (day, hhmm, endOfMinute) => {
    const [h, m] = (hhmm || "00:00").split(":").map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0, endOfMinute ? 59 : 0, endOfMinute ? 999 : 0).getTime();
  };
  let afterMs = at(startDay, startTimeEl.value, false);
  let beforeMs = at(endDay, endTimeEl.value, true);
  if (afterMs > beforeMs) {
    // Reversed (e.g. same day, end time earlier) — swap rather than complain.
    afterMs = at(endDay, endTimeEl.value, false);
    beforeMs = at(startDay, startTimeEl.value, true);
  }
  return { afterMs, beforeMs };
}

// ---------- Session token ----------
async function readToken() {
  const [r] = await browser.scripting.executeScript({
    target: { tabId: activeTabId },
    world: "MAIN",
    func: readTokenInPage,
  });
  return r?.result || { token: null, reason: "inject-failed" };
}

// ---------- Channel detect + export ----------

async function detect() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  if (!tab || !/^https:\/\/discord\.com\//.test(tab.url || "")) {
    channelEl.textContent = "請在 discord.com 的分頁開啟此插件。";
    channelEl.className = "channel err";
    return;
  }
  try {
    const res = await browser.tabs.sendMessage(activeTabId, { type: "dcx-detect" });
    if (res?.loc) {
      channelEl.textContent = res.loc.isDM ? "私訊 / 群組訊息" : `頻道 ${res.loc.channelId}`;
      channelEl.className = "channel ready";
      exportBtn.disabled = false;
    } else {
      channelEl.textContent = "未在任何頻道中，請先點開一個頻道或私訊。";
      channelEl.className = "channel err";
    }
  } catch (_) {
    channelEl.textContent = "無法連線到頁面，請重新整理 Discord 分頁後再試。";
    channelEl.className = "channel err";
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "dcx-progress") setStatus(`已取得 ${msg.count} 則訊息…`);
});

exportBtn.addEventListener("click", async () => {
  const formats = [...document.querySelectorAll(".formats input:checked")].map((c) => c.value);
  if (formats.length === 0) return setStatus("請至少選一個格式。", "err");
  const { afterMs, beforeMs } = rangeMs();

  exportBtn.disabled = true;
  setStatus("讀取登入資訊…");
  try {
    const r = await readToken();
    if (!r.token) throw new Error(tokenErrorMessage(r));
    const token = r.token;
    setStatus("開始匯出…（可關閉此面板，進度顯示在頁面右下角）");
    const res = await browser.tabs.sendMessage(activeTabId, { type: "dcx-export", token, afterMs, beforeMs, formats });
    if (!res?.ok) throw new Error(res?.error || "未知錯誤");
    if (res.count === 0) setStatus("這個時間範圍內沒有訊息。", "err");
    else setStatus(`完成：${res.count} 則訊息，${res.files} 個檔案。`, "ok");
  } catch (err) {
    setStatus(String(err?.message || err), "err");
  } finally {
    exportBtn.disabled = false;
  }
});

applyRange("today");
detect();
