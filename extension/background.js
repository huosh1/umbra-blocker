const STATUS_URL = "http://127.0.0.1:47821/status";
const RULE_ID_BASE = 1000;

async function fetchStatus() {
  try {
    const res = await fetch(STATUS_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Umbra pas lancé, ou watchdog pas encore élevé : pas d'erreur, juste rien à bloquer
    return null;
  }
}

async function applyRules(sites) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  const addRules = sites.map((domain, i) => ({
    id: RULE_ID_BASE + i,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: `/blocked.html?site=${encodeURIComponent(domain)}` },
    },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ["main_frame"] },
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function clearRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
    });
  }
}

async function poll() {
  const status = await fetchStatus();
  if (status && status.active && Array.isArray(status.sites) && status.sites.length) {
    await applyRules(status.sites);
  } else {
    await clearRules();
  }
}

chrome.alarms.create("umbra-poll", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "umbra-poll") poll();
});
chrome.runtime.onStartup.addListener(poll);
chrome.runtime.onInstalled.addListener(poll);
// Repoll à chaque navigation pour réduire la latence entre le début d'une
// session et le premier blocage effectif (sans attendre la prochaine alarme).
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") poll();
});

poll();
