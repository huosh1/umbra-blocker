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
    const { WATCHDOG_PID_FILE } = require("./src/lib/config");
    fs.writeFileSync(WATCHDOG_PID_FILE, String(process.pid), "utf-8");
    require("./src/lib/watchdogLoop").start();
    require("./src/lib/localServer").start();
  });
  app.on("window-all-closed", () => {
    // pas de fenêtre : ne rien faire, le processus continue de tourner
  });
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
    const { WATCHDOG_PID_FILE, EXTENSION_DIR, BACKGROUND_DIR } = require("./src/lib/config");

    function isWatchdogAlive() {
      if (!fs.existsSync(WATCHDOG_PID_FILE)) return false;
      const pid = parseInt(fs.readFileSync(WATCHDOG_PID_FILE, "utf-8").trim(), 10);
      if (!pid) return false;
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }

    // Le watchdog doit écrire le fichier hosts et gérer une règle pare-feu :
    // ça exige les droits admin sur Windows. On le lance élevé via
    // "Start-Process -Verb RunAs" (déclenche l'invite UAC une fois, au
    // premier démarrage de session). Le watchdog s'enregistre lui-même dans
    // WATCHDOG_PID_FILE une fois lancé (voir plus bas, MODE === "watchdog").
    function ensureWatchdog() {
      if (isWatchdogAlive()) return;
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
      const watchdogArgs = app.isPackaged ? ["--watchdog"] : [path.join(__dirname), "--watchdog"];
      const argList = watchdogArgs.map((a) => `'${a.replace(/'/g, "''")}'`).join(",");
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
            `${new Date().toISOString()} ERROR failed to spawn elevated watchdog: ${err.message}\n`,
            "utf-8"
          );
        });
      } catch (err) {
        fsSync.appendFileSync(
          require("./src/lib/config").LOG_FILE,
          `${new Date().toISOString()} ERROR ensureWatchdog spawn threw: ${err.message}\n`,
          "utf-8"
        );
      }
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
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Ouvrir Umbra", click: () => { mainWindow.show(); mainWindow.focus(); } },
        { type: "separator" },
        {
          label: "Quitter",
          click: () => {
            app.isQuiting = true;
            app.quit();
          },
        },
      ])
    );
    tray.on("click", () => { mainWindow.show(); mainWindow.focus(); });

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

    ipcMain.handle("vocab:list", () => vocab.loadAll());
    ipcMain.handle("vocab:stats", () => vocab.getStats());
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

    ipcMain.handle("periods:get", () => periodsLib.load());
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
  });

  app.on("before-quit", () => {
    app.isQuiting = true;
  });
}
