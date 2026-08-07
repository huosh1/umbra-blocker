const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { configStub } = require(path.join(__dirname, "helpers", "stub-electron.js"));
const session = require(path.join(__dirname, "..", "src", "lib", "session.js"));

function resetHistory() {
  fs.writeFileSync(configStub.HISTORY_FILE, "[]", "utf-8");
}
function readHistory() {
  return JSON.parse(fs.readFileSync(configStub.HISTORY_FILE, "utf-8"));
}

test("isBlockingActive: true for an active custom session", () => {
  const s = session.startCustom(30, false, "quest");
  assert.equal(session.isBlockingActive(s), true);
});

test("isBlockingActive: true during pomodoro work phase, false during break", () => {
  const s = session.startPomodoro({ workMinutes: 25, breakMinutes: 5, cyclesTotal: 2, hardMode: false, questName: "q" });
  assert.equal(session.isBlockingActive(s), true);
  s.pomodoro.phase = "break";
  assert.equal(session.isBlockingActive(s), false);
});

test("isBlockingActive: false when no session is active", () => {
  const s = session.stop(session.startCustom(5, false, "q"));
  assert.equal(session.isBlockingActive(s), false);
});

test("canStop: hard mode blocks stopping until time is up, soft mode never blocks", () => {
  const s = session.startCustom(30, true, "quest"); // hard mode, 30 min left
  assert.equal(session.canStop(s), false);

  s.endTs = Date.now() - 1000; // deja termine
  assert.equal(session.canStop(s), true);

  const soft = session.startCustom(30, false, "quest");
  assert.equal(session.canStop(soft), true);
});

test("stop() on an active session logs focused minutes to history", () => {
  resetHistory();
  const s = session.startCustom(60, false, "test-quest");
  s.startTs = Date.now() - 10 * 60000; // demarree il y a 10 min (simule le temps ecoule)
  session.stop(s);

  const entries = readHistory();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "custom");
  assert.equal(entries[0].questName, "test-quest");
  // ~10 minutes ecoulees, avec un peu de marge pour le temps d'execution du test
  assert.ok(entries[0].focusedMinutes >= 9.5 && entries[0].focusedMinutes <= 10.5, `expected ~10, got ${entries[0].focusedMinutes}`);
});

test("stop() on an already-inactive session doesn't log a duplicate entry", () => {
  resetHistory();
  const s = session.startCustom(60, false, "q");
  s.startTs = Date.now() - 5 * 60000; // 5 min ecoulees, pour que le premier stop() logge bien quelque chose
  session.stop(s);
  assert.equal(readHistory().length, 1);

  session.stop(s); // s.active est deja false ici - ne doit rien ajouter de plus
  assert.equal(readHistory().length, 1);
});

test("a very short session (under the logging threshold) isn't recorded", () => {
  resetHistory();
  const s = session.startCustom(60, false, "q");
  s.startTs = Date.now(); // aucun temps ecoule
  session.stop(s);
  assert.equal(readHistory().length, 0);
});

test("load() advances a pomodoro session whose current phase has already ended", () => {
  const s = session.startPomodoro({ workMinutes: 25, breakMinutes: 5, cyclesTotal: 2, hardMode: false, questName: "q" });
  s.endTs = Date.now() - 1000; // le cycle de travail est cense etre termine
  session.save(s);

  const loaded = session.load();
  assert.equal(loaded.pomodoro.phase, "break");
  assert.equal(loaded.active, true);
});

test("load() ends the session after the last pomodoro cycle completes", () => {
  resetHistory();
  const s = session.startPomodoro({ workMinutes: 25, breakMinutes: 5, cyclesTotal: 1, hardMode: false, questName: "last-cycle" });
  s.endTs = Date.now() - 1000; // dernier (et unique) cycle de travail termine
  session.save(s);

  const loaded = session.load();
  assert.equal(loaded.active, false);
  const entries = readHistory();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "pomodoro");
});
