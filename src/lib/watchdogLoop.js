const fs = require("fs");
const session = require("./session");
const periods = require("./periods");
const blocker = require("./blocker");
const { loadBlocklist } = require("./blocklist");
const { LOG_FILE } = require("./config");

const POLL_MS = 2000;

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // pas grave si le log échoue, l'enforcement continue
  }
}

// Boucle d'application des blocages. Utilisée par le processus watchdog
// détaché (--watchdog). Le blocage doit être actif si UNE session manuelle
// (custom, ou pomodoro en phase "travail") est en cours, OU si l'horloge
// murale tombe dans une plage récurrente (Period Mode) activée - ces deux
// sources sont indépendantes et se cumulent.
function createEnforcer() {
  // blocksActive : un blocage (site et/ou app) a été tenté pour la fenêtre
  // d'activité en cours (session ou période), donc il faudra nettoyer
  // (hosts + pare-feu) quand elle se termine.
  // dohBlockApplied : la règle pare-feu ne doit être (re)posée qu'une fois.
  // Chaque opération est isolée dans son propre try/catch : l'échec de l'une
  // (ex. écriture hosts refusée sans droits admin) ne doit jamais empêcher
  // les autres (ex. kill des apps bloquées) de s'exécuter.
  let blocksActive = false;
  let dohBlockApplied = false;

  async function tick() {
    const s = session.load(); // fait aussi avancer les phases pomodoro dues
    const periodsData = periods.load();
    const activePeriods = periods.getActivePeriods(periodsData);
    const sessionBlocking = session.isBlockingActive(s);
    const shouldBlock = sessionBlocking || activePeriods.length > 0;

    if (shouldBlock) {
      blocksActive = true;
      // Union des listes de toutes les sources actuellement actives : la
      // session manuelle utilise la blocklist globale, chaque période
      // active apporte en plus ses propres listes apps/sites.
      const apps = new Set();
      const sites = new Set();
      if (sessionBlocking) {
        try {
          const globalBl = loadBlocklist();
          (globalBl.apps || []).forEach((a) => apps.add(a));
          (globalBl.sites || []).forEach((s2) => sites.add(s2));
        } catch (err) {
          log(`ERROR loading blocklist: ${err.message}`);
        }
      }
      for (const p of activePeriods) {
        (p.apps || []).forEach((a) => apps.add(a));
        (p.sites || []).forEach((s2) => sites.add(s2));
      }
      const bl = { apps: [...apps], sites: [...sites] };

      try {
        blocker.applySiteBlock(bl.sites);
      } catch (err) {
        log(`ERROR site block failed: ${err.message}`);
      }

      if (!dohBlockApplied) {
        try {
          await blocker.applyDohBlock();
          dohBlockApplied = true;
        } catch (err) {
          log(`ERROR doh block failed: ${err.message}`);
        }
      }

      try {
        await blocker.enforceAppBlock(bl.apps);
      } catch (err) {
        log(`ERROR app block failed: ${err.message}`);
      }
    } else if (blocksActive) {
      try {
        blocker.removeSiteBlock();
      } catch (err) {
        log(`ERROR failed to remove site block: ${err.message}`);
      }
      try {
        await blocker.removeDohBlock();
      } catch (err) {
        log(`ERROR failed to remove doh block: ${err.message}`);
      }
      blocksActive = false;
      dohBlockApplied = false;
    }

    // Fin de vie d'une session "custom" expirée : indépendant du fait que
    // les blocages viennent d'être enlevés ou pas (couvre aussi le cas d'un
    // watchdog qui hérite d'une session déjà marquée active mais expirée).
    // Une session pomodoro se termine toute seule via session.load() - rien
    // à faire ici pour elle (une pause n'est pas une fin de session).
    if (s.kind === "custom" && s.active && session.remainingSeconds(s) <= 0) {
      const durationMinutes = (s.endTs - s.startTs) / 60000;
      log(`session terminee (${durationMinutes.toFixed(1)} min)`);
      session.stop(s);
    }
  }

  return { tick };
}

function start() {
  log("watchdog started");
  const enforcer = createEnforcer();
  tick();
  setInterval(tick, POLL_MS);

  function tick() {
    enforcer.tick().catch((err) => log(`ERROR unhandled: ${err.message}`));
  }
}

module.exports = { createEnforcer, start, POLL_MS };
