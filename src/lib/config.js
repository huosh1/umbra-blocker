const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// En dev (npm start / npm run watchdog / npm run challenge) on lit/écrit
// directement dans le dossier data/ du projet. Une fois packagée, l'app
// écrit dans userData (seul dossier garanti inscriptible) et se sert des
// fichiers par défaut embarqués dans resources/data-defaults pour amorcer
// blocklist.json et deck.json au premier lancement.
const DATA_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "data")
  : path.join(__dirname, "..", "..", "data");

const DEFAULTS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "data-defaults")
  : DATA_DIR;

fs.mkdirSync(DATA_DIR, { recursive: true });

function seedFromDefaults(filename, fallback) {
  const target = path.join(DATA_DIR, filename);
  if (fs.existsSync(target)) return;
  const src = path.join(DEFAULTS_DIR, filename);
  if (fs.existsSync(src) && src !== target) {
    fs.copyFileSync(src, target);
  } else {
    fs.writeFileSync(target, JSON.stringify(fallback, null, 2), "utf-8");
  }
}

seedFromDefaults("blocklist.json", { apps: [], sites: [] });
seedFromDefaults("deck.json", { cards_per_session: 10, cards: [] });

// data/vocab/ contient plusieurs fichiers de catégories (pas un seul comme
// blocklist/deck) : on copie individuellement chaque fichier par défaut
// absent, pour pouvoir ajouter de nouvelles catégories dans une future
// version sans jamais toucher aux fichiers déjà présents chez l'utilisateur
// (et donc sans jamais perdre vocab_progress.json qui vit à part).
function seedVocabDefaults() {
  const vocabDir = path.join(DATA_DIR, "vocab");
  fs.mkdirSync(vocabDir, { recursive: true });
  const srcDir = path.join(DEFAULTS_DIR, "vocab");
  if (!fs.existsSync(srcDir)) return;
  for (const filename of fs.readdirSync(srcDir)) {
    const target = path.join(vocabDir, filename);
    if (fs.existsSync(target)) continue;
    fs.copyFileSync(path.join(srcDir, filename), target);
  }
}
seedVocabDefaults();

const BLOCKLIST_FILE = path.join(DATA_DIR, "blocklist.json");
const SESSION_FILE = path.join(DATA_DIR, "session.json");
const DECK_FILE = path.join(DATA_DIR, "deck.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PERIODS_FILE = path.join(DATA_DIR, "periods.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const VOCAB_PROGRESS_FILE = path.join(DATA_DIR, "vocab_progress.json");
const LOG_FILE = path.join(DATA_DIR, "watchdog.log");
const WATCHDOG_PID_FILE = path.join(DATA_DIR, "watchdog.pid");
const HOSTS_BACKUP = path.join(DATA_DIR, "hosts.backup");
const BACKGROUND_DIR = path.join(DATA_DIR, "background");
fs.mkdirSync(BACKGROUND_DIR, { recursive: true });

const EXTENSION_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "extension")
  : path.join(__dirname, "..", "..", "extension");

const HOSTS_PATH = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const MARK_START = "# --- UMBRA BLOCK START ---";
const MARK_END = "# --- UMBRA BLOCK END ---";

const FIREWALL_RULE_NAME = "UmbraBlockSecureDNS";
// Résolveurs DNS chiffrés (DoH) les plus utilisés par défaut dans les
// navigateurs Chromium (Vivaldi, Chrome, Edge, Brave). Les bloquer force le
// navigateur à retomber sur le résolveur DNS système, qui respecte hosts.
const DOH_BLOCK_IPS = [
  "1.1.1.1", "1.0.0.1", // Cloudflare
  "8.8.8.8", "8.8.4.4", // Google
  "9.9.9.9", "149.112.112.112", // Quad9
];

// Processus qu'il ne faut jamais tuer, quoi que contienne la blocklist :
// système, shell Windows, et le runtime qui fait tourner Umbra lui-même.
const PROTECTED_PROCESSES = new Set([
  "system", "system idle process", "registry", "idle",
  "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe",
  "lsass.exe", "svchost.exe", "dwm.exe", "explorer.exe",
  "umbra.exe", "electron.exe", "node.exe",
  "fontdrvhost.exe", "sihost.exe", "taskhostw.exe", "ctfmon.exe", "conhost.exe",
]);

module.exports = {
  DATA_DIR,
  BLOCKLIST_FILE,
  SESSION_FILE,
  DECK_FILE,
  SETTINGS_FILE,
  PERIODS_FILE,
  HISTORY_FILE,
  VOCAB_PROGRESS_FILE,
  LOG_FILE,
  WATCHDOG_PID_FILE,
  EXTENSION_DIR,
  BACKGROUND_DIR,
  HOSTS_PATH,
  HOSTS_BACKUP,
  MARK_START,
  MARK_END,
  FIREWALL_RULE_NAME,
  DOH_BLOCK_IPS,
  PROTECTED_PROCESSES,
};
