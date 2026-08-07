const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const periods = require(path.join(__dirname, "..", "src", "lib", "periods.js"));

function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

test("recurring period active on the right day and time window", () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60000);
  const end = new Date(now.getTime() + 10 * 60000);
  const p = { id: "p1", name: "test", enabled: true, recurring: true, days: [now.getDay()], startTime: hhmm(start), endTime: hhmm(end) };
  assert.equal(periods.getActivePeriods({ periods: [p] }, now).length, 1);
});

test("recurring period inactive on a different day", () => {
  const now = new Date();
  const wrongDay = (now.getDay() + 1) % 7;
  const start = new Date(now.getTime() - 10 * 60000);
  const end = new Date(now.getTime() + 10 * 60000);
  const p = { id: "p1", name: "test", enabled: true, recurring: true, days: [wrongDay], startTime: hhmm(start), endTime: hhmm(end) };
  assert.equal(periods.getActivePeriods({ periods: [p] }, now).length, 0);
});

test("recurring period crossing midnight", () => {
  const now = new Date(2026, 0, 5, 23, 30, 0); // lundi 5 janv 2026, 23:30
  const p = { id: "p1", name: "night", enabled: true, recurring: true, days: [now.getDay()], startTime: "22:00", endTime: "02:00" };
  assert.equal(periods.getActivePeriods({ periods: [p] }, now).length, 1);

  const outsideWindow = new Date(2026, 0, 5, 12, 0, 0);
  assert.equal(periods.getActivePeriods({ periods: [p] }, outsideWindow).length, 0);
});

test("one-off period active only today, within its window, no midnight crossing", () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60000);
  const end = new Date(now.getTime() + 10 * 60000);
  const p = { id: "p1", name: "today", enabled: true, recurring: false, date: todayKey(now), startTime: hhmm(start), endTime: hhmm(end) };
  assert.equal(periods.getActivePeriods({ periods: [p] }, now).length, 1);
});

test("one-off period inactive on a different date, even with a matching time window", () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60000);
  const end = new Date(now.getTime() + 10 * 60000);
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const p = { id: "p1", name: "yesterday", enabled: true, recurring: false, date: todayKey(yesterday), startTime: hhmm(start), endTime: hhmm(end) };
  assert.equal(periods.getActivePeriods({ periods: [p] }, now).length, 0);
});

test("disabled period is never active regardless of day/time", () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60000);
  const end = new Date(now.getTime() + 10 * 60000);
  const p = { id: "p1", name: "off", enabled: false, recurring: true, days: [now.getDay()], startTime: hhmm(start), endTime: hhmm(end) };
  assert.equal(periods.getActivePeriods({ periods: [p] }, now).length, 0);
});

test("pausedDate for today suppresses an otherwise-active period without touching its config", () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60000);
  const end = new Date(now.getTime() + 10 * 60000);
  const p = { id: "p1", name: "paused", enabled: true, recurring: true, days: [now.getDay()], startTime: hhmm(start), endTime: hhmm(end), pausedDate: todayKey(now) };
  assert.equal(periods.getActivePeriods({ periods: [p] }, now).length, 0);

  // Le lendemain, la pause ne s'applique plus (elle ne vaut que pour la date exacte enregistrée)
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const pTomorrow = { ...p, days: [tomorrow.getDay()] };
  assert.equal(periods.getActivePeriods({ periods: [pTomorrow] }, tomorrow).length, 1);
});

test("minutesUntilEnd computes remaining time correctly, including across midnight", () => {
  const now = new Date(2026, 0, 5, 15, 30, 0);
  const p = { startTime: "14:00", endTime: "16:00" };
  assert.equal(periods.minutesUntilEnd(p, now), 30);

  const pOvernight = { startTime: "22:00", endTime: "02:00" };
  const lateNight = new Date(2026, 0, 5, 23, 0, 0);
  assert.equal(periods.minutesUntilEnd(pOvernight, lateNight), 180); // 23h00 -> 02h00 = 3h
});

test("hasEnabledPeriod reflects at least one enabled period, regardless of whether it's active right now", () => {
  assert.equal(periods.hasEnabledPeriod({ periods: [] }), false);
  assert.equal(periods.hasEnabledPeriod({ periods: [{ enabled: false }] }), false);
  assert.equal(periods.hasEnabledPeriod({ periods: [{ enabled: false }, { enabled: true }] }), true);
});
