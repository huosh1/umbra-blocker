const RING_CIRCUMFERENCE = 2 * Math.PI * 88; // r=88, cf. style.css

let currentBlocklist = { apps: [], sites: [] };
let currentDeck = { cards_per_session: 10, cards: [] };
let currentSettings = null;
let currentPeriods = { periods: [] };
let focusViewDismissed = false;
let lastSessionActive = false;
let selectedMode = "custom";

// ---------- Titlebar ----------
document.getElementById("btn-minimize").addEventListener("click", () => window.umbra.minimizeWindow());
document.getElementById("btn-hide").addEventListener("click", () => window.umbra.hideWindow());

// ---------- Tabs ----------
document.querySelectorAll(".side-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".side-tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ---------- Mode switch ----------
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedMode = btn.dataset.mode;
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-custom").classList.toggle("hidden", selectedMode !== "custom");
    document.getElementById("panel-pomodoro").classList.toggle("hidden", selectedMode !== "pomodoro");
    document.getElementById("panel-periode").classList.toggle("hidden", selectedMode !== "periode");
    if (selectedMode === "periode") {
      refreshWatchdogStatus();
      refreshActivePeriodsBanner();
    }
  });
});

// ---------- Duration presets ----------
function renderDurationPresets() {
  const container = document.getElementById("duration-presets");
  container.innerHTML = "";
  const presets = (currentSettings && currentSettings.durationPresets) || [25, 60, 180];
  for (const minutes of presets) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "preset-chip";
    chip.textContent = minutes >= 60 ? `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h` : `${minutes}min`;
    chip.addEventListener("click", () => {
      document.getElementById("input-duration").value = minutes;
      container.querySelectorAll(".preset-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
    container.appendChild(chip);
  }
}
document.getElementById("input-duration").addEventListener("input", (e) => {
  document.querySelectorAll("#duration-presets .preset-chip").forEach((c) => {
    c.classList.toggle("active", c.textContent === `${e.target.value}min` || c.textContent === `${e.target.value / 60}h`);
  });
});

// ---------- Session (Libre + Pomodoro partagent le timer) ----------
const timerText = document.getElementById("timer-text");
const statusText = document.getElementById("status-text");
const ringProgress = document.getElementById("ring-progress");
const stopFeedback = document.getElementById("stop-feedback");
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");

const focusView = document.getElementById("focus-view");
const focusTimerText = document.getElementById("focus-timer-text");
const focusStatusText = document.getElementById("focus-status-text");
const focusRingProgress = document.getElementById("focus-ring-progress");
const focusQuest = document.getElementById("focus-quest");
const focusStopFeedback = document.getElementById("focus-stop-feedback");

function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function phaseLabel(s) {
  if (s.kind === "pomodoro") {
    const phase = s.pomodoro.phase === "work" ? t("session.work") : t("session.break");
    const cycle = `${t("session.cycle")} ${s.pomodoro.cycleIndex + 1}/${s.pomodoro.cyclesTotal}`;
    return `${phase} — ${cycle}`;
  }
  return s.hardMode ? t("session.hardMode") : t("session.focusMode");
}

async function refreshSession() {
  const s = await window.umbra.getSession();
  if (s.active) {
    const total = Math.max(1, (s.endTs - s.startTs) / 1000);
    const remaining = s.remainingSeconds;
    const frac = Math.max(0, Math.min(1, remaining / total));
    const color = s.hardMode ? "var(--danger)" : "var(--accent)";

    timerText.textContent = formatHMS(remaining);
    statusText.textContent = `${phaseLabel(s)} — ${s.questName}`;
    ringProgress.style.stroke = color;
    ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - frac));
    btnStart.disabled = true;
    btnStop.disabled = false;

    focusTimerText.textContent = formatHMS(remaining);
    focusStatusText.textContent = phaseLabel(s);
    focusQuest.textContent = s.questName;
    focusRingProgress.style.stroke = color;
    focusRingProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - frac));

    if (!lastSessionActive) focusViewDismissed = false; // nouvelle session -> on montre la vue focus
    if (!focusViewDismissed) focusView.classList.remove("hidden");
    backToFocusBtn.classList.toggle("hidden", !focusViewDismissed);
  } else {
    timerText.textContent = "00:00:00";
    statusText.textContent = t("session.noSession");
    ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
    btnStart.disabled = false;
    btnStop.disabled = true;
    focusView.classList.add("hidden");
    backToFocusBtn.classList.add("hidden");
  }
  if (lastSessionActive && !s.active) refreshHistoryStats();
  lastSessionActive = s.active;
}

const statToday = document.getElementById("stat-today");
const statStreak = document.getElementById("stat-streak");
const statWeek = document.getElementById("stat-week");
function formatStatMinutes(min) {
  if (min >= 60) return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  return `${min}min`;
}
async function refreshHistoryStats() {
  const stats = await window.umbra.getHistoryStats();
  statToday.textContent = formatStatMinutes(stats.todayMinutes);
  statStreak.textContent = String(stats.streakDays);
  statWeek.textContent = formatStatMinutes(stats.weekMinutes);
}

document.getElementById("btn-start").addEventListener("click", async () => {
  await saveLists();
  const quest = document.getElementById("input-quest").value;
  const minutes = parseInt(document.getElementById("input-duration").value, 10) || 60;
  const hardMode = document.getElementById("input-hardmode").checked;
  await window.umbra.startSession({ quest, minutes, hardMode });
  stopFeedback.textContent = "";
  refreshSession();
});

document.getElementById("btn-start-pomo").addEventListener("click", async () => {
  await saveLists();
  const quest = document.getElementById("input-quest-pomo").value;
  const workMinutes = parseInt(document.getElementById("input-pomo-work").value, 10) || 25;
  const breakMinutes = parseInt(document.getElementById("input-pomo-break").value, 10) || 5;
  const cyclesTotal = parseInt(document.getElementById("input-pomo-cycles").value, 10) || 4;
  const hardMode = document.getElementById("input-hardmode-pomo").checked;
  await window.umbra.startPomodoro({ quest, workMinutes, breakMinutes, cyclesTotal, hardMode });
  stopFeedback.textContent = "";
  refreshSession();
});

async function doStop(feedbackEl) {
  const res = await window.umbra.stopSession();
  if (!res.ok) {
    const remaining = Math.ceil(res.remainingSeconds / 60);
    feedbackEl.textContent = t("session.hardModeBlocked", { min: remaining });
  } else {
    feedbackEl.textContent = "";
    refreshHistoryStats();
  }
  refreshSession();
}
btnStop.addEventListener("click", () => doStop(stopFeedback));
document.getElementById("btn-focus-stop").addEventListener("click", () => doStop(focusStopFeedback));

const backToFocusBtn = document.getElementById("btn-back-to-focus");
document.getElementById("btn-focus-dashboard").addEventListener("click", () => {
  focusViewDismissed = true;
  focusView.classList.add("hidden");
  refreshSession();
});
backToFocusBtn.addEventListener("click", () => {
  focusViewDismissed = false;
  refreshSession();
});

setInterval(refreshSession, 1000);

// ---------- Blocklist ----------
const appsTags = document.getElementById("apps-tags");
const sitesTags = document.getElementById("sites-tags");

function renderTags(container, items, onRemove) {
  container.innerHTML = "";
  for (const item of items) {
    const tag = document.createElement("div");
    tag.className = "tag";
    const label = document.createElement("span");
    label.textContent = item;
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.addEventListener("click", () => onRemove(item));
    tag.appendChild(label);
    tag.appendChild(remove);
    container.appendChild(tag);
  }
}

function renderBlocklist() {
  renderTags(appsTags, currentBlocklist.apps, (name) => {
    currentBlocklist.apps = currentBlocklist.apps.filter((a) => a !== name);
    renderBlocklist();
  });
  renderTags(sitesTags, currentBlocklist.sites, (site) => {
    currentBlocklist.sites = currentBlocklist.sites.filter((s) => s !== site);
    renderBlocklist();
  });
}

async function saveLists() {
  await window.umbra.saveBlocklist(currentBlocklist);
}

document.getElementById("btn-add-app").addEventListener("click", () => addApp());
document.getElementById("input-add-app").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addApp();
});
function addApp() {
  const input = document.getElementById("input-add-app");
  const name = input.value.trim();
  if (name && !currentBlocklist.apps.includes(name)) {
    currentBlocklist.apps.push(name);
    renderBlocklist();
  }
  input.value = "";
}

document.getElementById("btn-add-site").addEventListener("click", () => addSite());
document.getElementById("input-add-site").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});
function addSite() {
  const input = document.getElementById("input-add-site");
  const domain = input.value.trim().toLowerCase();
  if (domain && !currentBlocklist.sites.includes(domain)) {
    currentBlocklist.sites.push(domain);
    renderBlocklist();
  }
  input.value = "";
}

document.getElementById("btn-save-lists").addEventListener("click", async () => {
  await saveLists();
  showToast(t("blocklist.saved"));
});

// ---------- Extension navigateur ----------
document.getElementById("btn-open-extension").addEventListener("click", async () => {
  await window.umbra.openExtensionFolder();
});

// ---------- App picker ----------
const pickerOverlay = document.getElementById("picker-overlay");
const pickerList = document.getElementById("picker-list");
const pickerSearch = document.getElementById("picker-search");
let allRunningApps = [];

document.getElementById("btn-pick-app").addEventListener("click", async () => {
  pickerOverlay.classList.remove("hidden");
  pickerSearch.value = "";
  pickerList.innerHTML = '<div class="picker-item" style="color:var(--text-dim)">Chargement...</div>';
  allRunningApps = await window.umbra.listRunningApps();
  renderPicker();
  pickerSearch.focus();
});

document.getElementById("btn-picker-close").addEventListener("click", () => {
  pickerOverlay.classList.add("hidden");
});
pickerOverlay.addEventListener("click", (e) => {
  if (e.target === pickerOverlay) pickerOverlay.classList.add("hidden");
});
pickerSearch.addEventListener("input", renderPicker);

function renderPicker() {
  const query = pickerSearch.value.trim().toLowerCase();
  const filtered = allRunningApps.filter((n) => !query || n.toLowerCase().includes(query));
  pickerList.innerHTML = "";
  if (filtered.length === 0) {
    pickerList.innerHTML = '<div class="picker-item" style="color:var(--text-dim)">Aucun résultat</div>';
    return;
  }
  for (const name of filtered) {
    const btn = document.createElement("button");
    btn.className = "picker-item";
    btn.textContent = name;
    btn.addEventListener("click", async () => {
      if (!currentBlocklist.apps.includes(name)) {
        currentBlocklist.apps.push(name);
        renderBlocklist();
        await saveLists();
      }
      pickerOverlay.classList.add("hidden");
    });
    pickerList.appendChild(btn);
  }
}

// ---------- Deck (juste le nombre de mots par session ; le contenu vient de Vocabulaire) ----------
const cardsPerSessionInput = document.getElementById("input-cards-per-session");

function renderDeck() {
  cardsPerSessionInput.value = currentDeck.cards_per_session;
}

cardsPerSessionInput.addEventListener("input", () => {
  currentDeck.cards_per_session = parseInt(cardsPerSessionInput.value, 10) || 10;
});

document.getElementById("btn-save-deck").addEventListener("click", async () => {
  await window.umbra.saveDeck(currentDeck);
  showToast(t("deck.saved"));
});

document.getElementById("btn-test-challenge").addEventListener("click", () => {
  window.umbra.testChallenge();
});

// ---------- Startup ----------
const startupStatusText = document.getElementById("startup-status-text");
const btnToggleStartup = document.getElementById("btn-toggle-startup");

function renderStartupStatus({ installed, packaged }) {
  if (!packaged) {
    startupStatusText.textContent = t("deck.startupDevOnly");
    btnToggleStartup.disabled = true;
    btnToggleStartup.textContent = t("deck.startupUnavailable");
    return;
  }
  btnToggleStartup.disabled = false;
  startupStatusText.textContent = installed ? t("deck.startupActive") : t("deck.startupInactive");
  btnToggleStartup.textContent = installed ? t("deck.startupDisable") : t("deck.startupEnable");
}

btnToggleStartup.addEventListener("click", async () => {
  await window.umbra.toggleStartup();
  renderStartupStatus(await window.umbra.getStartupStatus());
});

// ---------- Périodes ----------
const periodsList = document.getElementById("periods-list");

function todayKeyClient() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderPeriods() {
  periodsList.innerHTML = "";
  currentPeriods.periods.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "period-row";

    const enable = document.createElement("label");
    enable.className = "switch period-enable";
    enable.innerHTML = '<span class="switch-track"><span class="switch-thumb"></span></span>';
    const enableInput = document.createElement("input");
    enableInput.type = "checkbox";
    enableInput.checked = p.enabled;
    enableInput.addEventListener("change", () => {
      p.enabled = enableInput.checked;
      // Rallumer l'interrupteur doit vraiment réactiver le blocage - sans
      // ça, une pause "aujourd'hui" laissée par erreur (voir bouton
      // Désactiver aujourd'hui) resterait active en silence même après
      // avoir remis "enabled" sur ON, ce qui est exactement le genre de
      // panne invisible qu'on veut éviter ici.
      if (p.enabled && p.pausedDate) {
        p.pausedDate = null;
        renderPeriods();
      }
    });
    enable.prepend(enableInput);

    const name = document.createElement("input");
    name.className = "field-input period-name";
    name.placeholder = t("periods.namePlaceholder");
    name.value = p.name || "";
    name.addEventListener("input", () => { p.name = name.value; });

    const daysWrap = document.createElement("div");
    daysWrap.className = "period-days";
    daysWrap.classList.toggle("hidden", !p.recurring);
    for (let d = 0; d < 7; d++) {
      const dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.className = "period-day-btn" + (p.days.includes(d) ? " active" : "");
      dayBtn.textContent = t(`periods.days.${d}`);
      dayBtn.addEventListener("click", () => {
        if (p.days.includes(d)) p.days = p.days.filter((x) => x !== d);
        else p.days.push(d);
        dayBtn.classList.toggle("active");
      });
      daysWrap.appendChild(dayBtn);
    }

    // Sans récurrence, une plage ne s'applique qu'au jour où elle a été
    // configurée (voir periods.js) - pas besoin de choisir des jours.
    const recurToggle = document.createElement("button");
    recurToggle.type = "button";
    recurToggle.className = "period-recur-toggle";
    function refreshRecurToggle() {
      recurToggle.textContent = p.recurring ? t("periods.recurring") : t("periods.todayOnly");
      recurToggle.classList.toggle("active", p.recurring);
      daysWrap.classList.toggle("hidden", !p.recurring);
    }
    recurToggle.addEventListener("click", () => {
      p.recurring = !p.recurring;
      if (!p.recurring) p.date = todayKeyClient();
      refreshRecurToggle();
    });
    refreshRecurToggle();

    const from = document.createElement("input");
    from.type = "time";
    from.className = "field-input period-time";
    from.value = p.startTime || "08:00";
    from.addEventListener("input", () => { p.startTime = from.value; });

    const to = document.createElement("input");
    to.type = "time";
    to.className = "field-input period-time";
    to.value = p.endTime || "12:00";
    to.addEventListener("input", () => { p.endTime = to.value; });

    const listsBtn = document.createElement("button");
    listsBtn.className = "btn btn-ghost btn-sm period-lists-btn";
    listsBtn.textContent = t("periods.editLists");
    listsBtn.addEventListener("click", () => openPeriodLists(p));

    // Rend visible une pause "aujourd'hui" active - sans ça, "enabled: true"
    // dans la liste mais rien qui bloque est indiscernable d'un bug.
    const pausedBadge = document.createElement("button");
    pausedBadge.type = "button";
    pausedBadge.className = "period-paused-badge" + (p.pausedDate === todayKeyClient() ? "" : " hidden");
    pausedBadge.textContent = t("periods.pausedBadge");
    pausedBadge.title = t("periods.pausedBadgeHint");
    pausedBadge.addEventListener("click", () => {
      p.pausedDate = null;
      renderPeriods();
    });

    const remove = document.createElement("button");
    remove.className = "period-remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      currentPeriods.periods.splice(idx, 1);
      renderPeriods();
    });

    row.appendChild(enable);
    row.appendChild(name);
    row.appendChild(recurToggle);
    row.appendChild(daysWrap);
    row.appendChild(from);
    row.appendChild(to);
    row.appendChild(listsBtn);
    row.appendChild(pausedBadge);
    row.appendChild(remove);
    periodsList.appendChild(row);
  });
}

document.getElementById("btn-add-period").addEventListener("click", () => {
  currentPeriods.periods.push({
    id: `p${Date.now()}`, name: "", enabled: true,
    recurring: false, date: todayKeyClient(), days: [1, 2, 3, 4, 5],
    startTime: "08:00", endTime: "12:00",
    apps: [...currentBlocklist.apps], sites: [...currentBlocklist.sites],
  });
  renderPeriods();
});

// ---------- Listes par plage (modal) ----------
const periodListsOverlay = document.getElementById("period-lists-overlay");
const periodAppsTags = document.getElementById("period-apps-tags");
const periodSitesTags = document.getElementById("period-sites-tags");
let editingPeriod = null;

function openPeriodLists(p) {
  editingPeriod = p;
  if (!Array.isArray(p.apps)) p.apps = [];
  if (!Array.isArray(p.sites)) p.sites = [];
  document.getElementById("period-lists-title").textContent = p.name || t("periods.editLists");
  renderPeriodLists();
  periodListsOverlay.classList.remove("hidden");
}

function renderPeriodLists() {
  renderTags(periodAppsTags, editingPeriod.apps, (name) => {
    editingPeriod.apps = editingPeriod.apps.filter((a) => a !== name);
    renderPeriodLists();
  });
  renderTags(periodSitesTags, editingPeriod.sites, (site) => {
    editingPeriod.sites = editingPeriod.sites.filter((s) => s !== site);
    renderPeriodLists();
  });
}

document.getElementById("period-btn-add-app").addEventListener("click", () => {
  const input = document.getElementById("period-input-add-app");
  const name = input.value.trim();
  if (name && !editingPeriod.apps.includes(name)) {
    editingPeriod.apps.push(name);
    renderPeriodLists();
  }
  input.value = "";
});
document.getElementById("period-input-add-app").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("period-btn-add-app").click();
});
document.getElementById("period-btn-add-site").addEventListener("click", () => {
  const input = document.getElementById("period-input-add-site");
  const domain = input.value.trim().toLowerCase();
  if (domain && !editingPeriod.sites.includes(domain)) {
    editingPeriod.sites.push(domain);
    renderPeriodLists();
  }
  input.value = "";
});
document.getElementById("period-input-add-site").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("period-btn-add-site").click();
});
document.getElementById("btn-period-copy-global").addEventListener("click", () => {
  editingPeriod.apps = [...currentBlocklist.apps];
  editingPeriod.sites = [...currentBlocklist.sites];
  renderPeriodLists();
  showToast(t("periods.copyGlobalDone"));
});
document.getElementById("btn-period-lists-close").addEventListener("click", () => {
  periodListsOverlay.classList.add("hidden");
});
document.getElementById("btn-period-lists-done").addEventListener("click", () => {
  periodListsOverlay.classList.add("hidden");
});
periodListsOverlay.addEventListener("click", (e) => {
  if (e.target === periodListsOverlay) periodListsOverlay.classList.add("hidden");
});

document.getElementById("btn-save-periods").addEventListener("click", async () => {
  await window.umbra.savePeriods(currentPeriods);
  showToast(t("periods.saved"));
  setTimeout(refreshWatchdogStatus, 1500); // laisse le temps au watchdog de démarrer/répondre à l'invite UAC
  refreshActivePeriodsBanner();
});

// ---------- Statut de protection (watchdog) ----------
const watchdogStatusDot = document.getElementById("watchdog-status-dot");
const watchdogStatusText = document.getElementById("watchdog-status-text");
const btnWatchdogRetry = document.getElementById("btn-watchdog-retry");
async function refreshWatchdogStatus() {
  const { alive } = await window.umbra.getWatchdogStatus();
  watchdogStatusDot.classList.toggle("alive", alive);
  watchdogStatusText.textContent = t(alive ? "periods.statusActive" : "periods.statusInactive");
  btnWatchdogRetry.classList.toggle("hidden", alive);
}
btnWatchdogRetry.addEventListener("click", async () => {
  watchdogStatusText.textContent = t("periods.statusChecking");
  await window.umbra.ensureWatchdog();
  setTimeout(refreshWatchdogStatus, 2000); // laisse le temps de répondre à l'invite UAC
});
setInterval(() => {
  if (!document.getElementById("panel-periode").classList.contains("hidden")) refreshWatchdogStatus();
}, 5000);

// Coupure rapide d'une plage active "pour aujourd'hui" (sans toucher à sa
// config récurrente) - une plage bloque automatiquement, sans bouton
// Démarrer, donc il faut un moyen tout aussi rapide d'en sortir en cas
// d'oubli ou de misclick sur "activé".
const activePeriodBanner = document.getElementById("active-period-banner");
const activePeriodBannerText = document.getElementById("active-period-banner-text");
const btnPausePeriodsToday = document.getElementById("btn-pause-periods-today");
let activePeriodsNow = [];
async function refreshActivePeriodsBanner() {
  activePeriodsNow = await window.umbra.getActivePeriodsNow();
  if (activePeriodsNow.length) {
    const names = activePeriodsNow.map((p) => p.name || t("periods.namePlaceholder")).join(", ");
    activePeriodBannerText.textContent = t("periods.activeNow", { names });
    activePeriodBanner.classList.remove("hidden");
  } else {
    activePeriodBanner.classList.add("hidden");
  }
}
btnPausePeriodsToday.addEventListener("click", async () => {
  const today = todayKeyClient();
  const activeIds = new Set(activePeriodsNow.map((p) => p.id));
  currentPeriods.periods.forEach((p) => {
    if (activeIds.has(p.id)) p.pausedDate = today;
  });
  await window.umbra.savePeriods(currentPeriods);
  showToast(t("periods.pausedToast"));
  renderPeriods();
  refreshActivePeriodsBanner();
});
setInterval(() => {
  if (!document.getElementById("panel-periode").classList.contains("hidden")) refreshActivePeriodsBanner();
}, 5000);

// ---------- Vocabulaire ----------
let allVocab = [];
let vocabFilter = "all";
let vocabQuery = "";
let vocabVisibleCount = 40;
const VOCAB_PAGE_SIZE = 40;

async function loadVocab() {
  allVocab = await window.umbra.getVocab();
  vocabVisibleCount = VOCAB_PAGE_SIZE;
  renderVocabStats();
  renderVocabList();
}

async function renderVocabStats() {
  const stats = await window.umbra.getVocabStats();
  document.getElementById("vocab-stats").textContent = t("vocab.statsLine", stats);
}

function filteredVocab() {
  const q = vocabQuery.trim().toLowerCase();
  return allVocab.filter((w) => {
    if (vocabFilter !== "all" && w.status !== vocabFilter) return false;
    if (!q) return true;
    return w.korean.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q);
  });
}

function renderVocabList() {
  const listEl = document.getElementById("vocab-list");
  const moreBtn = document.getElementById("btn-vocab-more");
  const filtered = filteredVocab();
  const visible = filtered.slice(0, vocabVisibleCount);
  listEl.innerHTML = "";

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "vocab-word-meaning";
    empty.textContent = t("vocab.noResults");
    listEl.appendChild(empty);
  }

  for (const w of visible) {
    const row = document.createElement("div");
    row.className = "vocab-word-row";

    const main = document.createElement("div");
    main.className = "vocab-word-main";
    const kr = document.createElement("div");
    kr.className = "vocab-word-kr";
    kr.textContent = w.korean;
    const meaning = document.createElement("div");
    meaning.className = "vocab-word-meaning";
    meaning.textContent = w.meaning;
    main.appendChild(kr);
    main.appendChild(meaning);
    if (w.example_kr) {
      const ex = document.createElement("div");
      ex.className = "vocab-word-example";
      ex.textContent = `${w.example_kr}${w.example_fr ? " — " + w.example_fr : ""}`;
      main.appendChild(ex);
    }

    const badges = document.createElement("div");
    badges.className = "vocab-status-badges";
    const statuses = [
      ["new", "vocab.markNew"],
      ["review", "vocab.markReview"],
      ["mastered", "vocab.markMastered"],
    ];
    for (const [status, key] of statuses) {
      const badge = document.createElement("button");
      badge.className = `vocab-status-badge status-${status}` + (w.status === status ? " active" : "");
      badge.textContent = t(key);
      badge.addEventListener("click", async () => {
        await window.umbra.setVocabStatus(w.id, status);
        w.status = status;
        renderVocabStats();
        renderVocabList();
      });
      badges.appendChild(badge);
    }

    row.appendChild(main);
    row.appendChild(badges);
    listEl.appendChild(row);
  }

  moreBtn.classList.toggle("hidden", filtered.length <= vocabVisibleCount);
}

document.getElementById("vocab-search").addEventListener("input", (e) => {
  vocabQuery = e.target.value;
  vocabVisibleCount = VOCAB_PAGE_SIZE;
  renderVocabList();
});

document.querySelectorAll(".vocab-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".vocab-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    vocabFilter = btn.dataset.filter;
    vocabVisibleCount = VOCAB_PAGE_SIZE;
    renderVocabList();
  });
});

document.getElementById("btn-vocab-more").addEventListener("click", () => {
  vocabVisibleCount += VOCAB_PAGE_SIZE;
  renderVocabList();
});

document.getElementById("btn-import-vocab").addEventListener("click", async () => {
  const result = await window.umbra.importVocab();
  if (!result) return;
  if (result.error || !result.count) {
    showToast(t("vocab.importEmpty"));
    return;
  }
  showToast(t("vocab.importResult", { count: result.count }));
  await loadVocab();
});

// ---------- Réglages ----------
// Thème/langue/particules/flou s'appliquent ET se sauvegardent tout de
// suite au clic - l'utilisateur ne doit pas avoir à deviner qu'il faut
// aussi cliquer "Enregistrer les réglages" pour que ça survive un redémarrage.
function saveSettingsNow() {
  window.umbra.saveSettings(currentSettings);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
document.querySelectorAll(".theme-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".theme-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentSettings.theme = btn.dataset.theme;
    applyTheme(currentSettings.theme);
    saveSettingsNow();
  });
});

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".lang-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    setLanguage(btn.dataset.lang);
    applyStaticTranslations();
    renderDurationPresets();
    renderDeck();
    renderPeriods();
    renderStartupStatus({ installed: btnToggleStartup.textContent === t("deck.startupDisable"), packaged: !btnToggleStartup.disabled });
    renderVocabStats();
    renderVocabList();
    currentSettings.language = btn.dataset.lang;
    saveSettingsNow();
  });
});

document.querySelectorAll(".particle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".particle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentSettings.particles = btn.dataset.particles;
    setParticleMode(currentSettings.particles);
    saveSettingsNow();
  });
});

function fileUrl(p) {
  return `file:///${p.replace(/\\/g, "/")}`;
}

const backgroundPreview = document.getElementById("background-preview");
const backgroundPreviewVideo = document.getElementById("background-preview-video");
function renderBackgroundPreview() {
  const { path: p, type } = currentSettings.background;
  if (p && type === "video") {
    backgroundPreview.style.backgroundImage = "none";
    backgroundPreview.textContent = "";
    backgroundPreviewVideo.src = fileUrl(p);
    backgroundPreviewVideo.load();
    backgroundPreviewVideo.classList.remove("hidden");
  } else if (p) {
    backgroundPreviewVideo.classList.add("hidden");
    backgroundPreviewVideo.removeAttribute("src");
    backgroundPreview.style.backgroundImage = `url("${fileUrl(p)}")`;
    backgroundPreview.textContent = "";
  } else {
    backgroundPreviewVideo.classList.add("hidden");
    backgroundPreviewVideo.removeAttribute("src");
    backgroundPreview.style.backgroundImage = "none";
    backgroundPreview.textContent = "—";
  }
}
function applyFocusBackground() {
  const focusBg = document.getElementById("focus-bg");
  const focusBgVideo = document.getElementById("focus-bg-video");
  const { path: p, type, blur } = currentSettings.background;
  if (p && type === "video") {
    focusBg.style.backgroundImage = "none";
    focusBg.classList.remove("blur");
    focusBgVideo.src = fileUrl(p);
    focusBgVideo.load();
    focusBgVideo.play().catch(() => {});
    focusBgVideo.classList.remove("hidden");
    focusBgVideo.classList.toggle("blur", !!blur);
  } else {
    focusBgVideo.classList.add("hidden");
    focusBgVideo.removeAttribute("src");
    focusBg.style.backgroundImage = p ? `url("${fileUrl(p)}")` : "none";
    focusBg.classList.toggle("blur", !!blur);
  }
}

document.getElementById("btn-pick-bg").addEventListener("click", async () => {
  const picked = await window.umbra.pickBackground();
  if (picked) {
    currentSettings.background.path = picked.path;
    currentSettings.background.type = picked.type;
    renderBackgroundPreview();
    applyFocusBackground();
  }
});
document.getElementById("btn-clear-bg").addEventListener("click", async () => {
  await window.umbra.clearBackground();
  currentSettings.background.path = null;
  currentSettings.background.type = null;
  renderBackgroundPreview();
  applyFocusBackground();
});
document.getElementById("input-blur").addEventListener("change", (e) => {
  currentSettings.background.blur = e.target.checked;
  applyFocusBackground();
  saveSettingsNow();
});
document.getElementById("input-sound").addEventListener("change", (e) => {
  currentSettings.soundEnabled = e.target.checked;
  saveSettingsNow();
});

const settingsPresets = document.getElementById("settings-presets");
function renderSettingsPresets() {
  renderTags(settingsPresets, currentSettings.durationPresets.map(String), (val) => {
    currentSettings.durationPresets = currentSettings.durationPresets.filter((p) => String(p) !== val);
    renderSettingsPresets();
  });
}
document.getElementById("btn-add-preset").addEventListener("click", () => {
  const input = document.getElementById("input-add-preset");
  const val = parseInt(input.value, 10);
  if (val > 0 && !currentSettings.durationPresets.includes(val)) {
    currentSettings.durationPresets.push(val);
    currentSettings.durationPresets.sort((a, b) => a - b);
    renderSettingsPresets();
  }
  input.value = "";
});

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  await window.umbra.saveSettings(currentSettings);
  renderDurationPresets();
  showToast(t("settings.saved"));
});

document.getElementById("btn-export-settings").addEventListener("click", async () => {
  const result = await window.umbra.exportSettings();
  if (result && result.ok) showToast(t("settings.exportDone"));
});
document.getElementById("btn-import-settings").addEventListener("click", async () => {
  const result = await window.umbra.importSettings();
  if (result && result.ok) showToast(t("settings.importDone"));
});

document.getElementById("btn-cleanup").addEventListener("click", async () => {
  await window.umbra.cleanupBeforeUninstall();
  showToast(t("settings.cleanupDone"));
});

// ---------- Mises à jour ----------
const updateBanner = document.getElementById("update-banner");
const updateBannerText = document.getElementById("update-banner-text");
const updateVersionLine = document.getElementById("update-version-line");
let pendingUpdateUrl = null;

function showUpdateBanner(result) {
  pendingUpdateUrl = result.url;
  updateBannerText.textContent = t("update.available", { version: result.latestVersion });
  updateBanner.classList.remove("hidden");
}

document.getElementById("update-banner-download").addEventListener("click", () => {
  if (pendingUpdateUrl) window.umbra.openReleasePage(pendingUpdateUrl);
});
document.getElementById("update-banner-dismiss").addEventListener("click", () => {
  updateBanner.classList.add("hidden");
});
window.umbra.onUpdateAvailable((result) => showUpdateBanner(result));

document.getElementById("btn-check-update").addEventListener("click", async () => {
  const btn = document.getElementById("btn-check-update");
  btn.disabled = true;
  const result = await window.umbra.checkForUpdate();
  btn.disabled = false;
  if (result.available) {
    showUpdateBanner(result);
    showToast(t("update.foundToast", { version: result.latestVersion }));
  } else {
    showToast(t("update.upToDate"));
  }
});

(async () => {
  const version = await window.umbra.getAppVersion();
  updateVersionLine.textContent = t("update.versionLine", { version });
})();

// ---------- Particules (vue focus, tsParticles) ----------
// Chaque bundle preset est auto-suffisant (moteur + preset), mais
// enregistrer un preset APRÈS le tout premier tsParticles.load() échoue
// ("Register plugins can only be done before calling tsParticles.load()").
// On enregistre donc les 4 presets une bonne fois pour toutes avant le
// moindre load().
const TS_PRESET_BY_MODE = { "ts-snow": "snow", "ts-links": "links", "ts-fireworks": "fireworks" };
// Chaque preset a par défaut un fond opaque (sombre) et des particules
// assez marquées, pensés pour être LE fond de la page - ça cachait
// entièrement l'image/vidéo de fond déjà choisie par l'utilisateur. Fond
// rendu transparent + effectifs/tailles/opacités réduits pour rester un
// habillage discret par-dessus le fond existant plutôt que le remplacer.
const TS_OVERRIDES = {
  snow: {
    background: { color: { value: "transparent" } },
    particles: {
      number: { value: 50 },
      opacity: { value: { min: 0.1, max: 0.35 } },
      size: { value: { min: 1, max: 3 } },
    },
  },
  links: {
    background: { color: { value: "transparent" } },
    particles: {
      number: { value: 45 },
      opacity: { value: 0.3 },
      links: { opacity: 0.2 },
    },
  },
  fireworks: {
    background: { color: { value: "transparent" } },
  },
};
const focusTsParticles = document.getElementById("focus-tsparticles");
let tsContainer = null;
const tsReady = (async () => {
  await window.loadSnowPreset(window.tsParticles);
  await window.loadLinksPreset(window.tsParticles);
  await window.loadFireworksPreset(window.tsParticles);
})();

// tsParticles crée parfois le canvas à la taille par défaut du navigateur
// (300x150) au lieu de la taille réelle de #focus-tsparticles - observé de
// façon non déterministe, sans rapport clair avec la visibilité/le layout
// du conteneur au moment du load(). Un simple dispatch de "resize" aide
// parfois mais pas de façon fiable à coup sûr. On boucle donc dessus
// (borné) jusqu'à ce que la taille du canvas corresponde réellement au
// conteneur. Pas de correctif "forcé" (canvas.width/height en direct) en
// dernier recours : ça désynchronise l'état interne de tsParticles de la
// taille réelle du canvas, et ça provoquait un flash noir/blanc quelques
// secondes plus tard quand tsParticles recalculait sa taille de son côté.
async function ensureTsCanvasSized(containerEl) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const canvas = containerEl.querySelector("canvas");
    if (!canvas) return;
    const rect = containerEl.getBoundingClientRect();
    const expectedW = Math.round(rect.width * devicePixelRatio);
    const expectedH = Math.round(rect.height * devicePixelRatio);
    if (Math.abs(canvas.width - expectedW) < 2 && Math.abs(canvas.height - expectedH) < 2) return;
    window.dispatchEvent(new Event("resize"));
    await new Promise((r) => requestAnimationFrame(r));
  }
}

async function setParticleMode(mode) {
  if (tsContainer) {
    tsContainer.destroy();
    tsContainer = null;
  }
  // Filet de sécurité : destroy() est censé retirer son canvas, mais si un
  // reliquat traîne (comportement déjà vu comme peu fiable avec cette
  // lib), "Aucun" doit rester une garantie visuelle, pas juste un espoir.
  focusTsParticles.innerHTML = "";
  const preset = TS_PRESET_BY_MODE[mode];
  if (preset) {
    focusTsParticles.classList.remove("hidden");
    await tsReady;
    // fullScreen est activé par défaut par tsParticles et ignore alors la
    // taille du conteneur - désactivé explicitement pour que le canvas
    // suive #focus-tsparticles (déjà positionné/dimensionné en CSS).
    tsContainer = await window.tsParticles.load({
      id: "focus-tsparticles",
      options: { preset, fullScreen: { enable: false }, ...TS_OVERRIDES[preset] },
    });
    await ensureTsCanvasSized(focusTsParticles);
  } else {
    focusTsParticles.classList.add("hidden");
  }
}

// ---------- Spotify (widget vue focus + aperçu Réglages) ----------
const spotifyWidget = document.getElementById("spotify-widget");
const spotifyTitle = document.getElementById("spotify-title");
const spotifyArtist = document.getElementById("spotify-artist");
const spotifyPreview = document.getElementById("spotify-preview");
const spotifyCoverImg = document.getElementById("spotify-cover-img");
const spotifyCoverFallback = document.getElementById("spotify-cover-fallback");
const spotifyIconPause = document.getElementById("spotify-icon-pause");
const spotifyIconPlay = document.getElementById("spotify-icon-play");

async function refreshSpotify() {
  const info = await window.umbra.getSpotifyNowPlaying();
  if (info.title) {
    spotifyWidget.classList.remove("hidden");
    spotifyTitle.textContent = info.title;
    spotifyArtist.textContent = info.artist;
    spotifyPreview.textContent = `${info.title} — ${info.artist}`;
    if (info.thumbnailDataUrl) {
      spotifyCoverImg.src = info.thumbnailDataUrl;
      spotifyCoverImg.classList.remove("hidden");
      spotifyCoverFallback.classList.add("hidden");
    } else {
      spotifyCoverImg.classList.add("hidden");
      spotifyCoverFallback.classList.remove("hidden");
    }
    // Icône "pause" affichée pendant la lecture (cliquer met en pause), et
    // inversement - convention standard des lecteurs media.
    spotifyIconPause.classList.toggle("hidden", !info.playing);
    spotifyIconPlay.classList.toggle("hidden", !!info.playing);
  } else {
    spotifyWidget.classList.add("hidden");
    spotifyPreview.textContent = "—";
  }
}
setInterval(refreshSpotify, 4000);
refreshSpotify();

document.getElementById("spotify-btn-prev").addEventListener("click", async () => {
  await window.umbra.spotifyControl("previous");
  refreshSpotify(); // pas de délai artificiel avant - chaque appel PowerShell a déjà son propre coût de démarrage
});
document.getElementById("spotify-btn-toggle").addEventListener("click", async () => {
  // Retour visuel immédiat (avant même la fin de la commande réelle) : le
  // démarrage de PowerShell + l'appel SMTC prennent ~250ms à eux seuls,
  // attendre la fin puis un refresh (encore ~500ms) donnait une réaction
  // perceptiblement en retard sur le clic. refreshSpotify() qui suit remet
  // l'icône dans le vrai état si jamais la commande a échoué.
  spotifyIconPause.classList.toggle("hidden");
  spotifyIconPlay.classList.toggle("hidden");
  await window.umbra.spotifyControl("toggle");
  refreshSpotify();
});
document.getElementById("spotify-btn-next").addEventListener("click", async () => {
  await window.umbra.spotifyControl("next");
  refreshSpotify();
});

// ---------- Init ----------
(async function init() {
  currentSettings = await window.umbra.getSettings();
  applyTheme(currentSettings.theme);
  document.querySelectorAll(".theme-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === currentSettings.theme));
  setLanguage(currentSettings.language);
  applyStaticTranslations();
  document.querySelectorAll(".lang-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === currentSettings.language));
  document.querySelectorAll(".particle-btn").forEach((b) => b.classList.toggle("active", b.dataset.particles === currentSettings.particles));
  document.getElementById("input-blur").checked = currentSettings.background.blur;
  document.getElementById("input-sound").checked = currentSettings.soundEnabled !== false;
  renderDurationPresets();
  renderSettingsPresets();
  renderBackgroundPreview();
  applyFocusBackground();
  setParticleMode(currentSettings.particles);

  currentBlocklist = await window.umbra.getBlocklist();
  renderBlocklist();
  currentDeck = await window.umbra.getDeck();
  renderDeck();
  currentPeriods = await window.umbra.getPeriods();
  renderPeriods();
  renderStartupStatus(await window.umbra.getStartupStatus());
  await loadVocab();
  refreshSession();
  refreshHistoryStats();
})();
