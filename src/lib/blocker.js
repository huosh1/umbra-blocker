const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const {
  HOSTS_PATH,
  HOSTS_BACKUP,
  MARK_START,
  MARK_END,
  FIREWALL_RULE_NAME,
  DOH_BLOCK_IPS,
  PROTECTED_PROCESSES,
} = require("./config");

function readHosts() {
  return fs.readFileSync(HOSTS_PATH, "utf-8");
}

function stripBlock(content) {
  const startIdx = content.indexOf(MARK_START);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(MARK_END);
  if (endIdx === -1) return content;
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + MARK_END.length);
  return before.replace(/\s+$/, "") + "\n" + after.replace(/^\s+/, "");
}

function applySiteBlock(sites) {
  if (!fs.existsSync(HOSTS_BACKUP)) {
    fs.writeFileSync(HOSTS_BACKUP, readHosts(), "utf-8");
  }
  const content = stripBlock(readHosts());
  const lines = [MARK_START];
  for (const site of sites) {
    const domain = (site || "").trim().toLowerCase();
    if (!domain) continue;
    lines.push(`127.0.0.1 ${domain}`);
    lines.push(`127.0.0.1 www.${domain}`);
  }
  lines.push(MARK_END);
  const newContent = content.replace(/\s+$/, "") + "\n\n" + lines.join("\n") + "\n";
  fs.writeFileSync(HOSTS_PATH, newContent, "utf-8");
}

// Le watchdog appelle ça à chaque tick où rien ne doit bloquer (pas
// seulement quand il pense avoir lui-même posé un blocage - voir
// watchdogLoop.js), donc no-op explicite ici s'il n'y a déjà rien à retirer
// pour éviter une écriture disque inutile toutes les 2s en continu.
function removeSiteBlock() {
  const original = readHosts();
  const content = stripBlock(original);
  if (content === original) return;
  fs.writeFileSync(HOSTS_PATH, content, "utf-8");
}

// Bloque les résolveurs DNS chiffrés les plus courants au niveau du
// pare-feu. Sans ça, un navigateur Chromium avec le DNS sécurisé activé
// (Vivaldi, Chrome, Edge...) ignore complètement le fichier hosts.
async function applyDohBlock() {
  const ips = DOH_BLOCK_IPS.join(",");
  try {
    await execFileAsync("netsh", [
      "advfirewall", "firewall", "add", "rule",
      `name=${FIREWALL_RULE_NAME}`, "dir=out", "action=block",
      `remoteip=${ips}`, "enable=yes",
    ]);
  } catch {
    // best-effort, comme côté python (capture_output, check=False)
  }
}

async function removeDohBlock() {
  try {
    await execFileAsync("netsh", [
      "advfirewall", "firewall", "delete", "rule", `name=${FIREWALL_RULE_NAME}`,
    ]);
  } catch {
    // rien à supprimer ou droits insuffisants : on ignore, best-effort
  }
}

async function listRunningApps() {
  const { stdout } = await execFileAsync("tasklist", ["/fo", "csv", "/nh"], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const names = new Set();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^"([^"]+)"/);
    if (!match) continue;
    const name = match[1];
    if (!name || PROTECTED_PROCESSES.has(name.toLowerCase())) continue;
    names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function enforceAppBlock(blockedApps) {
  const targets = new Set(
    (blockedApps || [])
      .map((a) => (a || "").trim().toLowerCase())
      .filter((a) => a && !PROTECTED_PROCESSES.has(a))
  );
  const killed = [];
  for (const name of targets) {
    try {
      await execFileAsync("taskkill", ["/IM", name, "/F"]);
      killed.push(name);
    } catch {
      // pas lancé, ou déjà tué : on ignore
    }
  }
  return killed;
}

module.exports = {
  applySiteBlock,
  removeSiteBlock,
  applyDohBlock,
  removeDohBlock,
  listRunningApps,
  enforceAppBlock,
};
