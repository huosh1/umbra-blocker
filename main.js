const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require("electron");

const args = process.argv.slice(app.isPackaged ? 1 : 2);
const MODE = args.includes("--watchdog") ? "watchdog" : args.includes("--challenge") ? "challenge" : "gui";

const ICON_PATH = path.join(__dirname, "assets", "icon.png");

// ---------------------------------------------------------------------
// Mode watchdog : processus détaché, headless, aucune fenêtre. Il survit à
// la fermeture (ou même au "Quitter") du tableau de bord : c'est lui, et
// uniquement lui, qui applique les blocages. Pour arrêter l'enforcement en
// Hard Mode avant la fin du minuteur il faut donc le tuer explicitement
// dans le Gestionnaire des tâches (processus "Umbra" portant l'argument
// --watchdog) - c'est l'échappatoire délibérée, assumée, du Hard Mode.
// ---------------------------------------------------------------------
if (MODE === "watchdog") {
  app.disableHardwareAcceleration();
  app.whenReady().then(() => {
    // watchdogLoop.start() écrit lui-même le fichier pid (et le "touche" à
    // chaque tick en heartbeat, voir isWatchdogAlive() plus bas).
    require("./src/lib/watchdogLoop").start();
    require("./src/lib/localServer").start();
  });
  app.on("window-all-closed", () => {
    // pas de fenêtre : ne rien faire, le processus continue de tourner
  });
} else if (MODE === "cleanup") {
  // Retire tout ce qu'Umbra a posé au niveau système (hosts, règle
  // pare-feu, raccourci de démarrage) et tue le watchdog s'il tourne encore
  // - pour permettre de supprimer proprement le dossier de l'app sans rien
  // laisser traîner. Doit tourner élevé (écrit hosts + gère le pare-feu).
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const { WATCHDOG_PID_FILE } = require("./src/lib/config");
    if (fs.existsSync(WATCHDOG_PID_FILE)) {
      const pid = parseInt(fs.readFileSync(WATCHDOG_PID_FILE, "utf-8").trim(), 10);
      if (pid) {
        try {
          process.kill(pid);
        } catch {
          // déjà mort, tant mieux
        }
      }
      try {
        fs.unlinkSync(WATCHDOG_PID_FILE);
      } catch {
        // rien à faire si le fichier a déjà disparu
      }
    }
    const session = require("./src/lib/session");
    const s = session.load();
    if (s.active) session.stop(s);
    const blocker = require("./src/lib/blocker");
    try {
      blocker.removeSiteBlock();
    } catch {
      // pas grave, on essaie quand même le reste
    }
    try {
      await blocker.removeDohBlock();
    } catch {
      // idem
    }
    try {
      require("./src/lib/startup").uninstall();
    } catch {
      // idem
    }
    app.quit();
  });
  app.on("window-all-closed", () => {});
} else if (MODE === "challenge") {
  // Lancement autonome (depuis le Démarrage Windows) : uniquement l'écran
  // de défi plein écran, pas de tableau de bord ni de tray.
  app.whenReady().then(() => {
    const { loadDeck } = require("./src/lib/deck");
    const vocab = require("./src/lib/vocab");
    ipcMain.handle("deck:pickSession", () => vocab.pickChallengeWords(loadDeck().cards_per_session || 10));
    ipcMain.handle("vocab:setStatus", (e, { id, status }) => {
      vocab.setStatus(id, status);
      return { ok: true };
    });
    createChallengeWindow({ standalone: true });
  });
  app.on("window-all-closed", () => app.quit());
} else {
  runGuiMode();
}

function createChallengeWindow({ standalone }) {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    alwaysOnTop: true,
    frame: false,
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  let finished = false;
  win.on("close", (e) => {
    if (!finished) e.preventDefault();
  });

  ipcMain.once(standalone ? "challenge:done:standalone" : "challenge:done", () => {
    finished = true;
    win.close();
    if (standalone) app.quit();
  });

  win.loadFile(path.join(__dirname, "src", "renderer", "challenge.html"), {
    query: { standalone: standalone ? "1" : "0" },
  });
  return win;
}

function runGuiMode() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  let mainWindow = null;
  let tray = null;

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const session = require("./src/lib/session");
    const { loadBlocklist, saveBlocklist } = require("./src/lib/blocklist");
    const { loadDeck, saveDeck } = require("./src/lib/deck");
    const blocker = require("./src/lib/blocker");
    const startup = require("./src/lib/startup");
    const periodsLib = require("./src/lib/periods");
    const settings = require("./src/lib/settings");
    const vocab = require("./src/lib/vocab");
    const history = require("./src/lib/history");
    const updater = require("./src/lib/updater");
    const { WATCHDOG_PID_FILE, EXTENSION_DIR, BACKGROUND_DIR, VOCAB_PROGRESS_FILE } = require("./src/lib/config");

    // Le GUI (non élevé) ne peut pas fiablement interroger un process
    // élevé par PID via process.kill(pid, 0) - Windows peut refuser l'accès
    // à travers la frontière d'élévation même si le process tourne bel et
    // bien, ce qui faisait croire à tort qu'aucun watchdog n'était actif et
    // en relançait un nouveau (et son invite UAC) en boucle. On se fie donc
    // uniquement à la fraîcheur du heartbeat que le watchdog écrit à chaque
    // tick (voir touchHeartbeat() dans watchdogLoop.js).
    const WATCHDOG_HEARTBEAT_TIMEOUT_MS = require("./src/lib/watchdogLoop").POLL_MS * 4;
    function isWatchdogAlive() {
      if (!fs.existsSync(WATCHDOG_PID_FILE)) return false;
      try {
        const age = Date.now() - fs.statSync(WATCHDOG_PID_FILE).mtimeMs;
        return age < WATCHDOG_HEARTBEAT_TIMEOUT_MS;
      } catch {
        return false;
      }
    }

    // Lance ce même exe élevé, avec les args donnés (ex: ["--watchdog"]).
    // Réutilisé pour le watchdog et pour le nettoyage avant désinstallation
    // - toute opération qui touche hosts/pare-feu doit passer par ici.
    function spawnElevated(extraArgs, onError) {
      const { spawn } = require("child_process");
      const fsSync = require("fs");
      // Chemin absolu plutôt que "powershell.exe" nu : un process Electron
      // lancé depuis l'Explorateur peut avoir un PATH plus restreint qu'un
      // terminal, et si spawn() ne trouve pas l'exécutable et qu'aucun
      // handler "error" n'est posé, l'échec est totalement silencieux.
      const psExe = path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
      );
      const exe = process.execPath;
      const fullArgs = app.isPackaged ? extraArgs : [path.join(__dirname), ...extraArgs];
      const argList = fullArgs.map((a) => `'${a.replace(/'/g, "''")}'`).join(",");
      const psCommand = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList ${argList} -Verb RunAs -WindowStyle Hidden`;
      const encoded = Buffer.from(psCommand, "utf16le").toString("base64");
      try {
        // IMPORTANT : pas de detached:true ici. Start-Process -Verb RunAs
        // doit s'exécuter depuis un process encore attaché normalement -
        // en DETACHED_PROCESS (ce que fait detached:true sous Windows),
        // ShellExecuteEx échoue à faire aboutir l'élévation, sans erreur
        // visible (le process intermédiaire se termine proprement quand
        // même). Confirmé par test isolé. Ce process intermédiaire est de
        // toute façon très court (Start-Process rend la main aussitôt),
        // donc pas besoin de le détacher pour ne pas bloquer l'app.
        const child = spawn(
          psExe,
          ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
          { stdio: "ignore", windowsHide: true }
        );
        child.on("error", (err) => {
          fsSync.appendFileSync(
            require("./src/lib/config").LOG_FILE,
            `${new Date().toISOString()} ERROR failed to spawn elevated process (${extraArgs.join(" ")}): ${err.message}\n`,
            "utf-8"
          );
          if (onError) onError(err);
        });
      } catch (err) {
        fsSync.appendFileSync(
          require("./src/lib/config").LOG_FILE,
          `${new Date().toISOString()} ERROR spawnElevated threw (${extraArgs.join(" ")}): ${err.message}\n`,
          "utf-8"
        );
        if (onError) onError(err);
      }
    }

    // Le watchdog doit écrire le fichier hosts et gérer une règle pare-feu :
    // ça exige les droits admin sur Windows. On le lance élevé via
    // "Start-Process -Verb RunAs" (déclenche l'invite UAC une fois, au
    // premier démarrage de session). Le watchdog s'enregistre lui-même dans
    // WATCHDOG_PID_FILE une fois lancé (voir plus bas, MODE === "watchdog").
    function ensureWatchdog() {
      if (isWatchdogAlive()) return;
      spawnElevated(["--watchdog"]);
    }

    // Des périodes actives ne doivent pas dépendre d'un démarrage manuel de
    // session pour prendre effet : si l'une d'elles est déjà activée, on
    // s'assure que le watchdog tourne dès l'ouverture du dashboard.
    if (periodsLib.hasEnabledPeriod(periodsLib.load())) ensureWatchdog();

    mainWindow = new BrowserWindow({
      width: 900,
      height: 620,
      minWidth: 760,
      minHeight: 520,
      frame: false,
      backgroundColor: "#0f1117",
      icon: ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
      },
    });
    mainWindow.loadFile(path.join(__dirname, "src", "renderer", "index.html"));

    mainWindow.on("close", (e) => {
      if (app.isQuiting) return;
      e.preventDefault();
      mainWindow.hide();
    });

    const trayIcon = nativeImage.createFromPath(ICON_PATH);
    tray = new Tray(trayIcon.isEmpty() ? trayIcon : trayIcon.resize({ width: 16, height: 16 }));
    tray.setToolTip("Umbra — Focus Blocker");
    tray.on("click", () => { mainWindow.show(); mainWindow.focus(); });

    // Démarrer/arrêter une session sans passer par le tableau de bord -
    // mêmes fonctions que les handlers IPC session:start/startPomodoro/stop
    // (même comportement : élève le watchdog, respecte le hard mode).
    function startQuickSession(minutes) {
      session.startCustom(minutes, false, "Session de focus");
      ensureWatchdog();
      updateTrayStatus();
    }
    function startQuickPomodoro() {
      session.startPomodoro({ workMinutes: 25, breakMinutes: 5, cyclesTotal: 4, hardMode: false, questName: "Session de focus" });
      ensureWatchdog();
      updateTrayStatus();
    }
    async function stopQuickSession() {
      const s = session.load();
      if (!session.canStop(s)) return;
      session.stop(s);
      try {
        blocker.removeSiteBlock();
        await blocker.removeDohBlock();
      } catch {
        // le watchdog nettoiera au prochain tick si ça échoue ici
      }
      updateTrayStatus();
    }

    function buildTrayMenu() {
      const s = session.load();
      const currentSettings = settings.load();
      const presets = currentSettings.durationPresets && currentSettings.durationPresets.length
        ? currentSettings.durationPresets
        : [25, 60, 180];
      const startItems = presets.map((minutes) => ({
        label: `${minutes} min`,
        click: () => startQuickSession(minutes),
      }));
      startItems.push({ label: "Pomodoro (25/5 × 4)", click: startQuickPomodoro });

      return Menu.buildFromTemplate([
        { label: "Ouvrir Umbra", click: () => { mainWindow.show(); mainWindow.focus(); } },
        { type: "separator" },
        { label: "Démarrer une session", submenu: startItems, enabled: !s.active },
        { label: "Arrêter la session", click: stopQuickSession, enabled: s.active && session.canStop(s) },
        { type: "separator" },
        {
          label: "Quitter",
          click: () => {
            app.isQuiting = true;
            app.quit();
          },
        },
      ]);
    }
    // setContextMenu() couvre le cas général (rafraîchi à chaque tick de
    // updateTrayStatus, donc au pire 5s de retard) ; le handler right-click
    // reconstruit le menu à l'instant du clic pour avoir l'état le plus
    // frais possible (session tout juste démarrée/arrêtée depuis le
    // tableau de bord, par exemple).
    tray.on("right-click", () => tray.popUpContextMenu(buildTrayMenu()));

    // Indicateur d'état visible en permanence (pas seulement dans l'onglet
    // Plage) : la plupart des bugs de blocage débattus cette session
    // (watchdog mort sans que rien ne l'indique, blocage orphelin, etc.)
    // se résument à "l'utilisateur ne peut pas savoir si la protection
    // tourne vraiment" tant qu'il ne va pas fouiller. Un point vert/rouge
    // sur l'icône système règle ça d'un coup d'œil, fenêtre ouverte ou non.
    const TRAY_ICON_ACTIVE_PATH = path.join(__dirname, "assets", "icon-tray-active.png");
    const TRAY_ICON_WARNING_PATH = path.join(__dirname, "assets", "icon-tray-warning.png");
    function computeProtectionStatus() {
      const s = session.load();
      const activePeriods = periodsLib.getActivePeriods(periodsLib.load());
      const shouldBeProtected = session.isBlockingActive(s) || activePeriods.length > 0;
      if (!shouldBeProtected) return "idle";
      return isWatchdogAlive() ? "active" : "warning";
    }
    function updateTrayStatus() {
      const status = computeProtectionStatus();
      const iconPath =
        status === "active" ? TRAY_ICON_ACTIVE_PATH :
        status === "warning" ? TRAY_ICON_WARNING_PATH :
        ICON_PATH;
      const icon = nativeImage.createFromPath(iconPath);
      tray.setImage(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
      tray.setToolTip(
        status === "active" ? "Umbra — Protection active" :
        status === "warning" ? "Umbra — Devrait protéger, mais le watchdog ne répond pas" :
        "Umbra — Focus Blocker"
      );
      tray.setContextMenu(buildTrayMenu());
    }
    updateTrayStatus();
    setInterval(updateTrayStatus, 5000);

    // --- IPC ---
    ipcMain.handle("window:minimize", () => mainWindow.minimize());
    ipcMain.handle("window:hide", () => mainWindow.hide());

    ipcMain.handle("session:get", () => {
      const s = session.load();
      return { ...s, remainingSeconds: session.remainingSeconds(s) };
    });

    ipcMain.handle("session:start", (e, { quest, minutes, hardMode }) => {
      const m = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
      const q = (quest || "").trim() || "Session de focus";
      const s = session.startCustom(m, !!hardMode, q);
      ensureWatchdog();
      return { ...s, remainingSeconds: session.remainingSeconds(s) };
    });

    ipcMain.handle("session:startPomodoro", (e, { quest, workMinutes, breakMinutes, cyclesTotal, hardMode }) => {
      const w = Number.isFinite(workMinutes) && workMinutes > 0 ? workMinutes : 25;
      const b = Number.isFinite(breakMinutes) && breakMinutes > 0 ? breakMinutes : 5;
      const c = Number.isFinite(cyclesTotal) && cyclesTotal > 0 ? cyclesTotal : 4;
      const q = (quest || "").trim() || "Session de focus";
      const s = session.startPomodoro({ workMinutes: w, breakMinutes: b, cyclesTotal: c, hardMode: !!hardMode, questName: q });
      ensureWatchdog();
      return { ...s, remainingSeconds: session.remainingSeconds(s) };
    });

    ipcMain.handle("session:stop", async () => {
      const s = session.load();
      if (!session.canStop(s)) {
        return { ok: false, remainingSeconds: session.remainingSeconds(s) };
      }
      session.stop(s);
      try {
        blocker.removeSiteBlock();
        await blocker.removeDohBlock();
      } catch {
        // le watchdog nettoiera au prochain tick si ça échoue ici
      }
      return { ok: true };
    });

    ipcMain.handle("blocklist:get", () => loadBlocklist());
    ipcMain.handle("blocklist:save", (e, data) => {
      saveBlocklist(data);
      return { ok: true };
    });

    ipcMain.handle("history:stats", () => history.getStats());
    ipcMain.handle("history:questBreakdown", (e, rangeDays) => history.getQuestBreakdown(rangeDays));
    ipcMain.handle("history:dailyBreakdown", (e, days) => history.getDailyBreakdown(days));
    ipcMain.handle("history:renameQuest", (e, oldName, newName) => {
      history.renameQuest(oldName, newName);
      return { ok: true };
    });
    ipcMain.handle("history:removeQuest", (e, name) => {
      history.removeQuest(name);
      return { ok: true };
    });
    ipcMain.handle("history:timeOfDayBreakdown", (e, rangeDays) => history.getTimeOfDayBreakdown(rangeDays));
    ipcMain.handle("history:weekdayBreakdown", (e, rangeDays) => history.getWeekdayBreakdown(rangeDays));

    ipcMain.handle("vocab:list", () => vocab.loadAll());
    ipcMain.handle("vocab:stats", () => vocab.getStats());
    ipcMain.handle("vocab:pickPractice", (e, options) => vocab.pickPracticeWords(options));
    ipcMain.handle("vocab:setStatus", (e, { id, status }) => {
      vocab.setStatus(id, status);
      return { ok: true };
    });
    ipcMain.handle("vocab:import", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Importer une liste de vocabulaire",
        properties: ["openFile"],
        filters: [
          { name: "Listes de vocabulaire", extensions: ["txt", "csv", "tsv", "json"] },
        ],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      try {
        return vocab.importFile(result.filePaths[0]);
      } catch (err) {
        return { count: 0, error: err.message };
      }
    });

    // Synthèse vocale coréenne locale (Piper, hors-ligne) - le renderer
    // retombe sur la voix Windows (Web Speech API) si ça échoue pour
    // n'importe quelle raison (binaire absent, erreur de synthèse...).
    ipcMain.handle("tts:speakKorean", async (e, text) => {
      const piperTts = require("./src/lib/piperTts");
      if (!piperTts.isAvailable()) return null;
      try {
        const buf = await piperTts.speak(text);
        return buf.toString("base64");
      } catch {
        return null;
      }
    });

    ipcMain.handle("watchdog:status", () => ({ alive: isWatchdogAlive() }));
    ipcMain.handle("watchdog:ensure", () => {
      ensureWatchdog();
      return { ok: true };
    });

    ipcMain.handle("periods:get", () => periodsLib.load());
    ipcMain.handle("periods:activeNow", () => periodsLib.getActivePeriods(periodsLib.load()));
    ipcMain.handle("periods:save", (e, data) => {
      periodsLib.save(data);
      // Une période enregistrée doit pouvoir bloquer immédiatement si on est
      // déjà dedans, même si aucune session manuelle n'a jamais été démarrée
      // - c'est le watchdog qui évalue les périodes, donc il doit tourner.
      if (periodsLib.hasEnabledPeriod(data)) ensureWatchdog();
      return { ok: true };
    });

    ipcMain.handle("settings:get", () => settings.load());
    ipcMain.handle("settings:save", (e, data) => {
      settings.save(data);
      return { ok: true };
    });
    const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
    ipcMain.handle("settings:pickBackground", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Choisir une image ou une vidéo de fond",
        properties: ["openFile"],
        filters: [
          { name: "Images et vidéos", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"] },
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
          { name: "Vidéos", extensions: ["mp4", "webm"] },
        ],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const src = result.filePaths[0];
      const ext = path.extname(src).toLowerCase();
      const type = VIDEO_EXTENSIONS.has(ext) ? "video" : "image";
      // Un seul fond gardé à la fois : nom fixe, écrase l'ancien.
      // Nom de fichier unique à chaque import (pas juste "bg.ext") : sinon
      // remplacer un fond par un autre de même extension garde exactement
      // la même URL file:// aux yeux du renderer, qui ne recharge donc rien
      // tant que l'app n'est pas relancée.
      const dest = path.join(BACKGROUND_DIR, `bg_${Date.now()}${ext}`);
      for (const f of fs.readdirSync(BACKGROUND_DIR)) {
        fs.unlinkSync(path.join(BACKGROUND_DIR, f));
      }
      fs.copyFileSync(src, dest);
      const current = settings.load();
      current.background.path = dest;
      current.background.type = type;
      settings.save(current);
      return { path: dest, type };
    });
    ipcMain.handle("settings:clearBackground", () => {
      for (const f of fs.readdirSync(BACKGROUND_DIR)) {
        fs.unlinkSync(path.join(BACKGROUND_DIR, f));
      }
      const current = settings.load();
      current.background.path = null;
      current.background.type = null;
      settings.save(current);
      return { ok: true };
    });

    ipcMain.handle("apps:list", () => blocker.listRunningApps());

    ipcMain.handle("deck:get", () => loadDeck());
    ipcMain.handle("deck:save", (e, data) => {
      saveDeck(data);
      return { ok: true };
    });
    ipcMain.handle("deck:pickSession", () => vocab.pickChallengeWords(loadDeck().cards_per_session || 10));

    ipcMain.handle("challenge:test", () => {
      createChallengeWindow({ standalone: false });
    });

    ipcMain.handle("spotify:nowPlaying", () => require("./src/lib/spotify").getNowPlaying());
    ipcMain.handle("spotify:control", (e, action) => {
      if (!["previous", "toggle", "next"].includes(action)) return { ok: false };
      return require("./src/lib/spotify").controlPlayback(action);
    });

    ipcMain.handle("extension:getPath", () => EXTENSION_DIR);
    ipcMain.handle("extension:openFolder", () => {
      shell.openPath(EXTENSION_DIR);
    });

    ipcMain.handle("startup:status", () => ({
      installed: startup.isInstalled(),
      packaged: app.isPackaged,
    }));
    ipcMain.handle("startup:toggle", () => {
      if (startup.isInstalled()) {
        startup.uninstall();
      } else {
        startup.install();
      }
      return { installed: startup.isInstalled() };
    });

    ipcMain.handle("app:cleanup", () => {
      spawnElevated(["--cleanup"]);
      return { started: true };
    });

    ipcMain.handle("app:getVersion", () => app.getVersion());

    ipcMain.handle("update:check", async () => {
      try {
        return await updater.checkForUpdate(app.getVersion());
      } catch {
        return { available: false };
      }
    });
    ipcMain.handle("update:openReleasePage", (e, url) => {
      if (typeof url === "string" && url.startsWith("https://github.com/")) shell.openExternal(url);
    });

    // Vérification silencieuse au démarrage (différée pour ne pas ralentir
    // le lancement) puis une fois par jour tant que l'app tourne - jamais
    // fatal si hors-ligne ou si aucune release n'a encore été publiée.
    async function checkForUpdateInBackground() {
      try {
        const result = await updater.checkForUpdate(app.getVersion());
        if (result.available && mainWindow) mainWindow.webContents.send("update:available", result);
      } catch {
        // pas grave, retentera au prochain cycle
      }
    }
    setTimeout(checkForUpdateInBackground, 8000);
    setInterval(checkForUpdateInBackground, 24 * 60 * 60 * 1000);

    ipcMain.handle("settings:exportAll", async () => {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Exporter les réglages Umbra",
        defaultPath: "umbra-backup.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return null;
      let vocabProgress = {};
      try {
        vocabProgress = JSON.parse(fs.readFileSync(VOCAB_PROGRESS_FILE, "utf-8"));
      } catch {
        // pas encore de progression enregistrée, on exporte un objet vide
      }
      const bundle = {
        exportedAt: new Date().toISOString(),
        blocklist: loadBlocklist(),
        deck: loadDeck(),
        periods: periodsLib.load(),
        settings: settings.load(),
        vocabProgress,
        history: history.load(),
      };
      fs.writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), "utf-8");
      return { ok: true, path: result.filePath };
    });

    ipcMain.handle("settings:importAll", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Importer des réglages Umbra",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      let bundle;
      try {
        bundle = JSON.parse(fs.readFileSync(result.filePaths[0], "utf-8"));
      } catch (err) {
        return { ok: false, error: err.message };
      }
      if (bundle.blocklist) saveBlocklist(bundle.blocklist);
      if (bundle.deck) saveDeck(bundle.deck);
      if (bundle.periods) periodsLib.save(bundle.periods);
      if (bundle.settings) settings.save(bundle.settings);
      if (bundle.vocabProgress) {
        fs.writeFileSync(VOCAB_PROGRESS_FILE, JSON.stringify(bundle.vocabProgress, null, 2), "utf-8");
      }
      if (bundle.history) history.save(bundle.history);
      return { ok: true };
    });
  });

  app.on("before-quit", () => {
    app.isQuiting = true;
    try {
      require("./src/lib/piperTts").shutdown();
    } catch {
      // pas grave, le process piper (s'il tournait) mourra avec le parent
    }
  });
}
