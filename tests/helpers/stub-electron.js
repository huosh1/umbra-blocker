// Préchargé via `node --require` avant de lancer les tests (voir le script
// "test" dans package.json). Intercepte "electron" (pas requêtable tel
// quel en dehors d'un vrai process Electron - require("electron") renvoie
// juste un chemin, pas {app, ...}) et "./config" (dont HOSTS_PATH pointe en
// dur sur le vrai fichier hosts Windows) pour que les modules testés
// écrivent uniquement dans un dossier temporaire, jamais dans de vraies
// données utilisateur ni le vrai hosts système.
const Module = require("module");
const os = require("os");
const path = require("path");
const fs = require("fs");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "umbra-test-"));
fs.mkdirSync(path.join(tempDir, "background"), { recursive: true });
fs.writeFileSync(path.join(tempDir, "hosts.txt"), "127.0.0.1 localhost\n", "utf-8");

const configStub = {
  DATA_DIR: tempDir,
  BLOCKLIST_FILE: path.join(tempDir, "blocklist.json"),
  SESSION_FILE: path.join(tempDir, "session.json"),
  DECK_FILE: path.join(tempDir, "deck.json"),
  SETTINGS_FILE: path.join(tempDir, "settings.json"),
  PERIODS_FILE: path.join(tempDir, "periods.json"),
  HISTORY_FILE: path.join(tempDir, "history.json"),
  VOCAB_PROGRESS_FILE: path.join(tempDir, "vocab_progress.json"),
  LOG_FILE: path.join(tempDir, "watchdog.log"),
  WATCHDOG_PID_FILE: path.join(tempDir, "watchdog.pid"),
  EXTENSION_DIR: path.join(tempDir, "extension"),
  BACKGROUND_DIR: path.join(tempDir, "background"),
  HOSTS_PATH: path.join(tempDir, "hosts.txt"),
  HOSTS_BACKUP: path.join(tempDir, "hosts.backup"),
  MARK_START: "# --- UMBRA BLOCK START ---",
  MARK_END: "# --- UMBRA BLOCK END ---",
  FIREWALL_RULE_NAME: "UmbraTestRule_DoesNotExist",
  DOH_BLOCK_IPS: ["203.0.113.1"], // TEST-NET-3 (RFC 5737) - jamais un vrai resolveur
  PROTECTED_PROCESSES: new Set(["system"]),
};

const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "electron") {
    return { app: { isPackaged: false, getPath: () => tempDir } };
  }
  if (request === "./config") {
    return configStub;
  }
  return originalLoad.call(this, request, parent, ...rest);
};

module.exports = { tempDir, configStub };
