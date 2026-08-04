const fs = require("fs");
const { PERIODS_FILE } = require("./config");

function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Une plage ponctuelle ("aujourd'hui seulement") n'a plus de raison d'être
// gardée une fois sa date passée - on la retire au chargement pour ne pas
// laisser périods.json grossir indéfiniment ni fausser hasEnabledPeriod().
function load() {
  if (!fs.existsSync(PERIODS_FILE)) return { periods: [] };
  try {
    const data = JSON.parse(fs.readFileSync(PERIODS_FILE, "utf-8"));
    const today = todayKey();
    const periods = (data.periods || [])
      .map((p) => ({ apps: [], sites: [], recurring: true, days: [], date: today, pausedDate: null, ...p }))
      .filter((p) => p.recurring || p.date >= today);
    return { periods };
  } catch {
    return { periods: [] };
  }
}

function save(data) {
  fs.writeFileSync(PERIODS_FILE, JSON.stringify({ periods: data.periods || [] }, null, 2), "utf-8");
}

function timeToMinutes(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function periodCoversNow(p, now) {
  if (!p.enabled) return false;
  // Coupure d'urgence pour aujourd'hui seulement (voir "Désactiver
  // aujourd'hui" côté UI) : ne touche pas à la config (jours/horaires), donc
  // une plage récurrente reprend normalement le jour suivant sans rien
  // devoir réactiver à la main.
  if (p.pausedDate === todayKey(now)) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(p.startTime);
  const end = timeToMinutes(p.endTime);
  if (start === end) return false;
  if (p.recurring) {
    if (!Array.isArray(p.days) || !p.days.includes(now.getDay())) return false;
    if (start < end) return mins >= start && mins < end;
    return mins >= start || mins < end; // plage récurrente qui traverse minuit (ex: 22:00 -> 02:00)
  }
  // plage ponctuelle : bornée au jour choisi, pas de traversée de minuit
  if (p.date !== todayKey(now)) return false;
  return start < end && mins >= start && mins < end;
}

// Minutes restantes avant la fin d'une plage actuellement active (pour
// remonter un temps restant à l'extension navigateur, comme pour une
// session classique).
function minutesUntilEnd(p, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const end = timeToMinutes(p.endTime);
  if (end > mins) return end - mins;
  return 1440 - mins + end; // la fin est passée minuit (plage récurrente uniquement)
}

// true si au moins une plage activée couvre l'instant donné.
function isActiveNow(data, now = new Date()) {
  return (data.periods || []).some((p) => periodCoversNow(p, now));
}

// Les plages actuellement actives, pour récupérer leurs listes de blocage
// propres (apps/sites par période).
function getActivePeriods(data, now = new Date()) {
  return (data.periods || []).filter((p) => periodCoversNow(p, now));
}

function hasEnabledPeriod(data) {
  return (data.periods || []).some((p) => p.enabled);
}

module.exports = { load, save, isActiveNow, getActivePeriods, hasEnabledPeriod, minutesUntilEnd, todayKey };
