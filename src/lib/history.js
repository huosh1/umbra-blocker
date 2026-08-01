const fs = require("fs");
const { HISTORY_FILE } = require("./config");

function load() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(entries) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

// Ajoute une entrée quand une session (custom ou pomodoro) se termine,
// qu'elle soit allée à son terme ou arrêtée en cours de route.
function append({ kind, hardMode, questName, focusedMinutes, endedAt = Date.now() }) {
  if (!focusedMinutes || focusedMinutes < 0.1) return; // rien à enregistrer, session quasi instantanée
  const entries = load();
  entries.push({ endedAt, kind, hardMode: !!hardMode, questName: questName || "", focusedMinutes: Math.round(focusedMinutes * 10) / 10 });
  // garde un historique raisonnable, pas la peine de grossir indéfiniment
  const trimmed = entries.slice(-2000);
  save(trimmed);
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getStats(now = new Date()) {
  const entries = load();
  const todayKey = dayKey(now.getTime());

  let todayMinutes = 0;
  const minutesByDay = new Map();
  for (const e of entries) {
    const key = dayKey(e.endedAt);
    minutesByDay.set(key, (minutesByDay.get(key) || 0) + e.focusedMinutes);
    if (key === todayKey) todayMinutes += e.focusedMinutes;
  }

  // série : nombre de jours consécutifs (en remontant depuis aujourd'hui ou
  // hier si rien fait encore aujourd'hui) avec au moins une session terminée.
  let streak = 0;
  const cursor = new Date(now);
  if (!minutesByDay.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (minutesByDay.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // semaine en cours (lundi -> aujourd'hui)
  const weekStart = new Date(now);
  const dow = (weekStart.getDay() + 6) % 7; // 0 = lundi
  weekStart.setDate(weekStart.getDate() - dow);
  weekStart.setHours(0, 0, 0, 0);
  let weekMinutes = 0;
  for (const e of entries) {
    if (e.endedAt >= weekStart.getTime()) weekMinutes += e.focusedMinutes;
  }

  return {
    todayMinutes: Math.round(todayMinutes),
    weekMinutes: Math.round(weekMinutes),
    streakDays: streak,
    totalSessions: entries.length,
  };
}

module.exports = { load, save, append, getStats };
