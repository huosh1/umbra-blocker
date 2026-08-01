const fs = require("fs");
const { SESSION_FILE } = require("./config");
const history = require("./history");

function defaultSession() {
  return {
    active: false,
    kind: "custom", // "custom" | "pomodoro"
    hardMode: false,
    startTs: 0,
    endTs: 0,
    questName: "",
    pomodoro: null, // { workMinutes, breakMinutes, cyclesTotal, cycleIndex, phase }
  };
}

function save(session) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

// Fait avancer une session pomodoro dont la phase en cours est terminée
// (travail -> pause -> travail suivant, ou fin du dernier cycle -> session
// terminée). Appelée depuis load() : quel que soit qui la charge en premier
// (watchdog ou dashboard), l'état avance de façon cohérente sur la même
// horloge murale, sans double-décompte ni désync entre les deux processus.
function advancePomodoroIfDue(s) {
  if (s.kind !== "pomodoro" || !s.active || Date.now() < s.endTs) return s;
  const p = s.pomodoro;
  if (p.phase === "work") {
    if (p.cycleIndex + 1 >= p.cyclesTotal) {
      s.active = false;
      save(s);
      history.append({
        kind: "pomodoro",
        hardMode: s.hardMode,
        questName: s.questName,
        focusedMinutes: p.cyclesTotal * p.workMinutes,
      });
      return s;
    }
    p.phase = "break";
    s.startTs = s.endTs;
    s.endTs = s.startTs + p.breakMinutes * 60000;
  } else {
    p.cycleIndex += 1;
    p.phase = "work";
    s.startTs = s.endTs;
    s.endTs = s.startTs + p.workMinutes * 60000;
  }
  save(s);
  return advancePomodoroIfDue(s); // au cas où plusieurs phases seraient dues d'un coup (watchdog resté éteint longtemps)
}

function load() {
  if (!fs.existsSync(SESSION_FILE)) return defaultSession();
  let s;
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    s = { ...defaultSession(), ...data };
  } catch {
    return defaultSession();
  }
  return advancePomodoroIfDue(s);
}

function startCustom(durationMinutes, hardMode, questName) {
  const now = Date.now();
  const s = {
    ...defaultSession(),
    active: true,
    kind: "custom",
    hardMode: !!hardMode,
    startTs: now,
    endTs: now + durationMinutes * 60 * 1000,
    questName,
  };
  save(s);
  return s;
}

function startPomodoro({ workMinutes, breakMinutes, cyclesTotal, hardMode, questName }) {
  const now = Date.now();
  const s = {
    ...defaultSession(),
    active: true,
    kind: "pomodoro",
    hardMode: !!hardMode,
    startTs: now,
    endTs: now + workMinutes * 60000,
    questName,
    pomodoro: { workMinutes, breakMinutes, cyclesTotal, cycleIndex: 0, phase: "work" },
  };
  save(s);
  return s;
}

function remainingSeconds(s) {
  if (!s.active) return 0;
  return Math.max(0, (s.endTs - Date.now()) / 1000);
}

// Le blocage doit être actif pendant une session "custom", ou pendant la
// phase "travail" d'un pomodoro - pas pendant sa pause.
function isBlockingActive(s) {
  if (!s.active) return false;
  if (s.kind === "pomodoro") return s.pomodoro.phase === "work";
  return true;
}

function canStop(s) {
  if (!s.active) return true;
  if (!s.hardMode) return true;
  return remainingSeconds(s) <= 0;
}

// Temps réellement passé en phase "travail", même pour un arrêt manuel en
// cours de route (pas juste la durée programmée) - c'est ça qui doit
// remonter dans l'historique/les stats.
function computeFocusedMinutes(s) {
  if (s.kind === "custom") {
    const elapsed = (Date.now() - s.startTs) / 60000;
    const scheduled = (s.endTs - s.startTs) / 60000;
    return Math.max(0, Math.min(elapsed, scheduled));
  }
  const p = s.pomodoro;
  if (p.phase === "work") {
    const partial = Math.max(0, Math.min((Date.now() - s.startTs) / 60000, p.workMinutes));
    return p.cycleIndex * p.workMinutes + partial;
  }
  return (p.cycleIndex + 1) * p.workMinutes; // en pause : le cycle de travail qui y a mené est complet
}

function stop(s) {
  if (s.active) {
    history.append({
      kind: s.kind,
      hardMode: s.hardMode,
      questName: s.questName,
      focusedMinutes: computeFocusedMinutes(s),
    });
  }
  s.active = false;
  save(s);
  return s;
}

module.exports = {
  load,
  save,
  startCustom,
  startPomodoro,
  remainingSeconds,
  isBlockingActive,
  canStop,
  stop,
};
