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
  assert.deepEqual(stats, {
    todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, averageSessionMinutes: 0, streakDays: 0, totalSessions: 0,
  });
});

test("getStats: monthMinutes only counts entries from the current calendar month", () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0);
  history.save([
    { endedAt: now.getTime(), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 30 },
    { endedAt: lastMonth.getTime(), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 99 },
  ]);
  assert.equal(history.getStats(now).monthMinutes, 30);
});

test("getStats: averageSessionMinutes averages entries from the last 30 days only", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 20 },
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 40 },
    { endedAt: daysAgo(60), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 999 }, // hors fenêtre
  ]);
  assert.equal(history.getStats().averageSessionMinutes, 30);
});

test("append() ignores sessions under the 0.1 minute threshold", () => {
  history.save([]);
  history.append({ kind: "custom", hardMode: false, questName: "instant", focusedMinutes: 0.05 });
  assert.equal(history.load().length, 0);

  history.append({ kind: "custom", hardMode: false, questName: "real", focusedMinutes: 5 });
  assert.equal(history.load().length, 1);
});

test("getQuestBreakdown: aggregates minutes by quest name, sorted descending", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "Thèse", focusedMinutes: 30 },
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "Thèse", focusedMinutes: 90 },
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "Coréen", focusedMinutes: 45 },
  ]);
  const breakdown = history.getQuestBreakdown(7);
  assert.deepEqual(breakdown, [
    { questName: "Thèse", minutes: 120 },
    { questName: "Coréen", minutes: 45 },
  ]);
});

test("getQuestBreakdown: entries with an empty quest name fall back to a default label", () => {
  history.save([{ endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "", focusedMinutes: 20 }]);
  assert.deepEqual(history.getQuestBreakdown(7), [{ questName: "Session de focus", minutes: 20 }]);
});

test("getQuestBreakdown: respects the range window, rangeDays=null means all-time", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "recent", focusedMinutes: 10 },
    { endedAt: daysAgo(30), kind: "custom", hardMode: false, questName: "old", focusedMinutes: 10 },
  ]);
  assert.deepEqual(history.getQuestBreakdown(7), [{ questName: "recent", minutes: 10 }]);
  const all = history.getQuestBreakdown(null).sort((a, b) => a.questName.localeCompare(b.questName));
  assert.deepEqual(all, [
    { questName: "old", minutes: 10 },
    { questName: "recent", minutes: 10 },
  ]);
});

test("getDailyBreakdown: returns one entry per day over the window, zero-filled", () => {
  history.save([{ endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 25 }]);
  const daily = history.getDailyBreakdown(3);
  assert.equal(daily.length, 3);
  assert.equal(daily[daily.length - 1].minutes, 25); // aujourd'hui, en dernier
  assert.equal(daily[0].minutes, 0); // il y a 2 jours, rien
});

test("renameQuest: relabels every matching entry, merging with an existing name if any", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "Coreen", focusedMinutes: 20 },
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "Coreen", focusedMinutes: 10 },
    { endedAt: daysAgo(1), kind: "custom", hardMode: false, questName: "Coréen", focusedMinutes: 15 },
  ]);
  history.renameQuest("Coreen", "Coréen");
  const breakdown = history.getQuestBreakdown(null);
  assert.deepEqual(breakdown, [{ questName: "Coréen", minutes: 45 }]);
});

test("renameQuest: does nothing for a blank or unchanged name", () => {
  history.save([{ endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "Thèse", focusedMinutes: 20 }]);
  history.renameQuest("Thèse", "  ");
  history.renameQuest("Thèse", "Thèse");
  assert.deepEqual(history.getQuestBreakdown(null), [{ questName: "Thèse", minutes: 20 }]);
});

test("removeQuest: reassigns entries to the default bucket instead of deleting them", () => {
  history.save([
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "Coréen", focusedMinutes: 20 },
    { endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "", focusedMinutes: 5 },
  ]);
  history.removeQuest("Coréen");
  const breakdown = history.getQuestBreakdown(null);
  assert.deepEqual(breakdown, [{ questName: history.DEFAULT_QUEST, minutes: 25 }]);
  assert.equal(history.load().length, 2); // rien n'a été supprimé, juste relabellisé
});

test("removeQuest: removing the default bucket itself is a no-op", () => {
  history.save([{ endedAt: daysAgo(0), kind: "custom", hardMode: false, questName: "", focusedMinutes: 20 }]);
  history.removeQuest(history.DEFAULT_QUEST);
  assert.deepEqual(history.getQuestBreakdown(null), [{ questName: history.DEFAULT_QUEST, minutes: 20 }]);
});

function atHour(hour, daysAgoCount = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgoCount);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

test("getTimeOfDayBreakdown: buckets minutes into morning/afternoon/evening/night", () => {
  history.save([
    { endedAt: atHour(8), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 }, // matin
    { endedAt: atHour(14), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 20 }, // apres-midi
    { endedAt: atHour(20), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 30 }, // soir
    { endedAt: atHour(2), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 40 }, // nuit
  ]);
  const breakdown = history.getTimeOfDayBreakdown(30);
  assert.deepEqual(breakdown, [
    { key: "morning", minutes: 10 },
    { key: "afternoon", minutes: 20 },
    { key: "evening", minutes: 30 },
    { key: "night", minutes: 40 },
  ]);
});

test("getTimeOfDayBreakdown: respects the range window", () => {
  history.save([{ endedAt: atHour(8, 60), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 10 }]);
  const breakdown = history.getTimeOfDayBreakdown(30);
  assert.equal(breakdown.every((b) => b.minutes === 0), true);
});

test("getWeekdayBreakdown: returns minutes per weekday, Monday first", () => {
  const breakdown = history.getWeekdayBreakdown(30);
  assert.equal(breakdown.length, 7);
  assert.deepEqual(breakdown.map((b) => b.dow), [1, 2, 3, 4, 5, 6, 0]);
});

test("getWeekdayBreakdown: correctly attributes minutes to today's weekday", () => {
  const now = new Date();
  history.save([{ endedAt: now.getTime(), kind: "custom", hardMode: false, questName: "a", focusedMinutes: 15 }]);
  const breakdown = history.getWeekdayBreakdown(30, now);
  const todayEntry = breakdown.find((b) => b.dow === now.getDay());
  assert.equal(todayEntry.minutes, 15);
});
