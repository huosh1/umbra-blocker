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

  getVocab: () => ipcRenderer.invoke("vocab:list"),
  getVocabStats: () => ipcRenderer.invoke("vocab:stats"),
  setVocabStatus: (id, status) => ipcRenderer.invoke("vocab:setStatus", { id, status }),
  importVocab: () => ipcRenderer.invoke("vocab:import"),

  getStartupStatus: () => ipcRenderer.invoke("startup:status"),
  toggleStartup: () => ipcRenderer.invoke("startup:toggle"),
  cleanupBeforeUninstall: () => ipcRenderer.invoke("app:cleanup"),

  getSpotifyNowPlaying: () => ipcRenderer.invoke("spotify:nowPlaying"),

  getExtensionPath: () => ipcRenderer.invoke("extension:getPath"),
  openExtensionFolder: () => ipcRenderer.invoke("extension:openFolder"),

  challengeDone: (standalone) =>
    ipcRenderer.send(standalone ? "challenge:done:standalone" : "challenge:done"),
});
