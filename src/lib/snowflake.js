"use strict";

// Discord snowflake IDs encode a creation timestamp in their high bits.
// Epoch is 2015-01-01T00:00:00Z. Converting a time to a boundary snowflake
// lets the API page straight to a time range instead of scanning from newest.
const DISCORD_EPOCH = 1420070400000n;

// Smallest snowflake created at or after `ms` — use for the `after` cursor.
function timeToSnowflake(ms) {
  const t = BigInt(Math.floor(ms)) - DISCORD_EPOCH;
  return (t < 0n ? 0n : t << 22n).toString();
}

// Largest snowflake created at or before `ms` — use for the `before` cursor.
function timeToSnowflakeCeil(ms) {
  const t = BigInt(Math.floor(ms)) - DISCORD_EPOCH;
  if (t < 0n) return "0";
  return ((t << 22n) | 0x3fffffn).toString();
}

function snowflakeToTime(id) {
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { timeToSnowflake, timeToSnowflakeCeil, snowflakeToTime, DISCORD_EPOCH };
}
