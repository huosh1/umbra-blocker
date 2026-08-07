const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

require(path.join(__dirname, "helpers", "stub-electron.js"));
const history = require(path.join(__dirname, "..", "src", "lib", "history.js"));

function daysAgo(n, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

test("getStats: today's minutes only counts entries from today", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 25 },
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "b", focusedMinutes: 40 },
  ]);
  const stats = history.getStats();
  assert.equal(stats.todayMinutes, 25);
  assert.equal(stats.totalSessions, 2);
});

test("getStats: streak counts consecutive days ending today", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 },
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 },
    { endedAt: daysAgo(2), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 },
  ]);
  assert.equal(history.getStats().streakDays, 3);
});

test("getStats: streak still counts if today has nothing yet but yesterday does", () => {
  history.save([
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 },
    { endedAt: daysAgo(2), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 },
  ]);
  assert.equal(history.getStats().streakDays, 2);
});

test("getStats: streak resets to 0 when there's a gap", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 },
    { endedAt: daysAgo(3), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 }, // trou de 2 jours
  ]);
  assert.equal(history.getStats().streakDays, 1);
});

test("getStats: empty history gives zeroed stats, not an error", () => {
  history.save([]);
  const stats = history.getStats();
  assert.deepEqual(stats, { todayMinutes: 0, weekMinutes: 0, streakDays: 0, totalSessions: 0 });
});

test("append() ignores sessions under the 0.1 minute threshold", () => {
  history.save([]);
  history.append({ kind: "custom", hardMode: false, questName: "instant", focusedMinutes: 0.05 });
  assert.equal(history.load().length, 0);

  history.append({ kind: "custom", hardMode: false, questName: "real", focusedMinutes: 5 });
  assert.equal(history.load().length, 1);
});
