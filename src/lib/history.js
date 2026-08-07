const fs = require("fs");
const { HISTORY_FILE } = require("./config");

const DEFAULT_QUEST = "Session de focus";

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

  // mois civil en cours
  let monthMinutes = 0;
  for (const e of entries) {
    const d = new Date(e.endedAt);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) monthMinutes += e.focusedMinutes;
  }

  // moyenne par session sur les 30 derniers jours (plus représentatif du
  // rythme actuel qu'une moyenne all-time qui se tasse avec le temps)
  const avgSinceTs = now.getTime() - 30 * 24 * 3600 * 1000;
  const recent = entries.filter((e) => e.endedAt >= avgSinceTs);
  const averageSessionMinutes = recent.length
    ? Math.round(recent.reduce((sum, e) => sum + e.focusedMinutes, 0) / recent.length)
    : 0;

  return {
    todayMinutes: Math.round(todayMinutes),
    weekMinutes: Math.round(weekMinutes),
    monthMinutes: Math.round(monthMinutes),
    averageSessionMinutes,
    streakDays: streak,
    totalSessions: entries.length,
  };
}

// Répartition du temps par quête ("Thèse", "Coréen"...) sur une fenêtre
// donnée - réutilise le champ questName déjà stocké par session, sans
// imposer un système de tags séparé à apprendre. rangeDays=null => tout
// l'historique.
function getQuestBreakdown(rangeDays = 7, now = new Date()) {
  const entries = load();
  const sinceTs = rangeDays == null ? 0 : now.getTime() - rangeDays * 24 * 3600 * 1000;
  const byQuest = new Map();
  for (const e of entries) {
    if (e.endedAt < sinceTs) continue;
    const name = (e.questName || "").trim() || DEFAULT_QUEST;
    byQuest.set(name, (byQuest.get(name) || 0) + e.focusedMinutes);
  }
  return [...byQuest.entries()]
    .map(([questName, minutes]) => ({ questName, minutes: Math.round(minutes) }))
    .sort((a, b) => b.minutes - a.minutes);
}

// Minutes par jour sur les N derniers jours (inclut les jours à 0, pour un
// visuel jour par jour régulier plutôt qu'une liste creuse).
function getDailyBreakdown(days = 14, now = new Date()) {
  const entries = load();
  const minutesByDay = new Map();
  for (const e of entries) minutesByDay.set(dayKey(e.endedAt), (minutesByDay.get(dayKey(e.endedAt)) || 0) + e.focusedMinutes);

  const result = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i);
    result.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      minutes: Math.round(minutesByDay.get(dayKey(d.getTime())) || 0),
    });
  }
  return result;
}

function hourBucket(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

// Répartition du temps par moment de la journée (matin/après-midi/soir/
// nuit), basée sur l'heure de fin de session - une approximation
// suffisante pour repérer une tendance ("plutôt du soir"), sans avoir à
// stocker une heure de début séparée juste pour ça.
function getTimeOfDayBreakdown(rangeDays = 30, now = new Date()) {
  const entries = load();
  const sinceTs = rangeDays == null ? 0 : now.getTime() - rangeDays * 24 * 3600 * 1000;
  const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const e of entries) {
    if (e.endedAt < sinceTs) continue;
    buckets[hourBucket(new Date(e.endedAt).getHours())] += e.focusedMinutes;
  }
  return ["morning", "afternoon", "evening", "night"].map((key) => ({ key, minutes: Math.round(buckets[key]) }));
}

// Répartition du temps par jour de la semaine (lundi -> dimanche), pour
// repérer le jour où tu bosses le plus sur la période.
function getWeekdayBreakdown(rangeDays = 30, now = new Date()) {
  const entries = load();
  const sinceTs = rangeDays == null ? 0 : now.getTime() - rangeDays * 24 * 3600 * 1000;
  const minutesByDow = [0, 0, 0, 0, 0, 0, 0]; // index = Date.getDay() (0 = dimanche)
  for (const e of entries) {
    if (e.endedAt < sinceTs) continue;
    minutesByDow[new Date(e.endedAt).getDay()] += e.focusedMinutes;
  }
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
  return mondayFirst.map((dow) => ({ dow, minutes: Math.round(minutesByDow[dow]) }));
}

// Renomme une quête dans tout l'historique (fusionne les minutes si le
// nouveau nom existe déjà, puisque getQuestBreakdown agrège par nom).
function renameQuest(oldName, newName) {
  const trimmed = (newName || "").trim();
  if (!trimmed || trimmed === oldName) return;
  const entries = load();
  let changed = false;
  for (const e of entries) {
    if (((e.questName || "").trim() || DEFAULT_QUEST) === oldName) {
      e.questName = trimmed;
      changed = true;
    }
  }
  if (changed) save(entries);
}

// "Retire" une quête de la répartition : les entrées concernées retombent
// dans la catégorie par défaut plutôt que d'être supprimées - le temps de
// focus déjà enregistré ne disparaît jamais, seule l'étiquette change.
function removeQuest(name) {
  if (name === DEFAULT_QUEST) return;
  renameQuest(name, DEFAULT_QUEST);
}

module.exports = {
  load, save, append, getStats, getQuestBreakdown, getDailyBreakdown,
  getTimeOfDayBreakdown, getWeekdayBreakdown, renameQuest, removeQuest, DEFAULT_QUEST,
};
