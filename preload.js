const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("umbra", {
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  hideWindow: () => ipcRenderer.invoke("window:hide"),

  getSession: () => ipcRenderer.invoke("session:get"),
  startSession: (payload) => ipcRenderer.invoke("session:start", payload),
  startPomodoro: (payload) => ipcRenderer.invoke("session:startPomodoro", payload),
  stopSession: () => ipcRenderer.invoke("session:stop"),

  getBlocklist: () => ipcRenderer.invoke("blocklist:get"),
  saveBlocklist: (data) => ipcRenderer.invoke("blocklist:save", data),
  listRunningApps: () => ipcRenderer.invoke("apps:list"),

  getPeriods: () => ipcRenderer.invoke("periods:get"),
  savePeriods: (data) => ipcRenderer.invoke("periods:save", data),
  getActivePeriodsNow: () => ipcRenderer.invoke("periods:activeNow"),

  getWatchdogStatus: () => ipcRenderer.invoke("watchdog:status"),
  ensureWatchdog: () => ipcRenderer.invoke("watchdog:ensure"),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (data) => ipcRenderer.invoke("settings:save", data),
  pickBackground: () => ipcRenderer.invoke("settings:pickBackground"),
  clearBackground: () => ipcRenderer.invoke("settings:clearBackground"),
  exportSettings: () => ipcRenderer.invoke("settings:exportAll"),
  importSettings: () => ipcRenderer.invoke("settings:importAll"),

  getDeck: () => ipcRenderer.invoke("deck:get"),
  saveDeck: (data) => ipcRenderer.invoke("deck:save", data),
  pickSessionDeck: () => ipcRenderer.invoke("deck:pickSession"),
  testChallenge: () => ipcRenderer.invoke("challenge:test"),

  getHistoryStats: () => ipcRenderer.invoke("history:stats"),
  getQuestBreakdown: (rangeDays) => ipcRenderer.invoke("history:questBreakdown", rangeDays),
  getDailyBreakdown: (days) => ipcRenderer.invoke("history:dailyBreakdown", days),
  renameQuest: (oldName, newName) => ipcRenderer.invoke("history:renameQuest", oldName, newName),
  removeQuest: (name) => ipcRenderer.invoke("history:removeQuest", name),
  getTimeOfDayBreakdown: (rangeDays) => ipcRenderer.invoke("history:timeOfDayBreakdown", rangeDays),
  getWeekdayBreakdown: (rangeDays) => ipcRenderer.invoke("history:weekdayBreakdown", rangeDays),

  getVocab: () => ipcRenderer.invoke("vocab:list"),
  getVocabStats: () => ipcRenderer.invoke("vocab:stats"),
  pickPracticeWords: (options) => ipcRenderer.invoke("vocab:pickPractice", options),
  setVocabStatus: (id, status) => ipcRenderer.invoke("vocab:setStatus", { id, status }),
  importVocab: () => ipcRenderer.invoke("vocab:import"),

  getStartupStatus: () => ipcRenderer.invoke("startup:status"),
  toggleStartup: () => ipcRenderer.invoke("startup:toggle"),
  cleanupBeforeUninstall: () => ipcRenderer.invoke("app:cleanup"),

  getSpotifyNowPlaying: () => ipcRenderer.invoke("spotify:nowPlaying"),
  spotifyControl: (action) => ipcRenderer.invoke("spotify:control", action),

  getExtensionPath: () => ipcRenderer.invoke("extension:getPath"),
  openExtensionFolder: () => ipcRenderer.invoke("extension:openFolder"),

  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  openReleasePage: (url) => ipcRenderer.invoke("update:openReleasePage", url),
  onUpdateAvailable: (callback) => ipcRenderer.on("update:available", (e, data) => callback(data)),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),

  challengeDone: (standalone) =>
    ipcRenderer.send(standalone ? "challenge:done:standalone" : "challenge:done"),
});
