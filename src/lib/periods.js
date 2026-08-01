const fs = require("fs");
const { PERIODS_FILE } = require("./config");

function load() {
  if (!fs.existsSync(PERIODS_FILE)) return { periods: [] };
  try {
    const data = JSON.parse(fs.readFileSync(PERIODS_FILE, "utf-8"));
    const periods = (data.periods || []).map((p) => ({
      apps: [],
      sites: [],
      ...p,
    }));
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
  if (!Array.isArray(p.days) || !p.days.includes(now.getDay())) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(p.startTime);
  const end = timeToMinutes(p.endTime);
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end; // plage qui traverse minuit (ex: 22:00 -> 02:00)
}

// true si au moins une plage récurrente activée couvre l'instant donné.
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

module.exports = { load, save, isActiveNow, getActivePeriods, hasEnabledPeriod };
