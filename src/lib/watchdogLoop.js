const fs = require("fs");
const path = require("path");
const { Notification } = require("electron");
const session = require("./session");
const periods = require("./periods");
const blocker = require("./blocker");
const settings = require("./settings");
const { loadBlocklist } = require("./blocklist");
const { LOG_FILE, WATCHDOG_PID_FILE } = require("./config");

const POLL_MS = 2000;
const ICON_PATH = path.join(__dirname, "..", "..", "assets", "icon.png");

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // pas grave si le log échoue, l'enforcement continue
  }
}

const NOTIF_TEXT = {
  fr: {
    breakTitle: "Pause !",
    breakBody: "Le temps de travail est terminé, profite de ta pause.",
    workTitle: "Retour au travail !",
    workBody: "La pause est terminée, prochain cycle de travail.",
    doneTitle: "Session terminée",
    doneBody: "Bravo, ta session de focus est terminée.",
  },
  en: {
    breakTitle: "Break time!",
    breakBody: "Work phase is over, enjoy your break.",
    workTitle: "Back to work!",
    workBody: "Break is over, next work cycle starting.",
    doneTitle: "Session complete",
    doneBody: "Nice, your focus session is done.",
  },
};

// Le watchdog tourne indépendamment de la fenêtre GUI (souvent cachée ou
// fermée) : c'est le seul processus garanti de voir passer ces transitions,
// donc c'est lui qui doit déclencher les notifications système.
function notify(key) {
  if (!Notification.isSupported()) return;
  let lang = "fr";
  try {
    lang = settings.load().language === "en" ? "en" : "fr";
  } catch {
    // pas grave, on garde le français par défaut
  }
  const text = NOTIF_TEXT[lang];
  try {
    new Notification({
      title: text[`${key}Title`],
      body: text[`${key}Body`],
      icon: ICON_PATH,
    }).show();
  } catch (err) {
    log(`ERROR notification failed: ${err.message}`);
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

  // État observé au tick précédent, pour détecter les transitions à notifier
  // (travail -> pause, pause -> travail, session -> terminée) sans jamais
  // notifier au tout premier tick (une session déjà en cours au démarrage du
  // watchdog ne doit pas déclencher un faux "session terminée").
  let notifInitialized = false;
  let lastActive = false;
  let lastKind = null;
  let lastPhase = null;

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
      session.stop(s); // mute s.active à false en place
    }

    const curPhase = s.kind === "pomodoro" && s.pomodoro ? s.pomodoro.phase : null;
    if (notifInitialized) {
      if (lastActive && !s.active) {
        notify("done");
      } else if (lastActive && s.active && lastKind === "pomodoro" && s.kind === "pomodoro" && lastPhase && curPhase && lastPhase !== curPhase) {
        notify(curPhase === "break" ? "break" : "work");
      }
    }
    notifInitialized = true;
    lastActive = s.active;
    lastKind = s.kind;
    lastPhase = curPhase;
  }

  return { tick };
}

// process.kill(pid, 0) depuis le processus GUI (non élevé) n'est pas fiable
// pour vérifier si CE watchdog (élevé) est vivant - Windows peut refuser la
// requête à travers la frontière d'élévation (accès refusé alors même que
// le process tourne). On préfère donc un heartbeat : le fichier pid est
// réécrit à chaque tick, et le GUI juge le watchdog vivant si ce fichier a
// été touché récemment (voir isWatchdogAlive() dans main.js), peu importe
// qui peut ou non interroger le process par PID.
function touchHeartbeat() {
  try {
    fs.writeFileSync(WATCHDOG_PID_FILE, String(process.pid), "utf-8");
  } catch (err) {
    log(`ERROR heartbeat write failed: ${err.message}`);
  }
}

function start() {
  log("watchdog started");
  touchHeartbeat();
  const enforcer = createEnforcer();
  tick();
  setInterval(tick, POLL_MS);

  function tick() {
    touchHeartbeat();
    enforcer.tick().catch((err) => log(`ERROR unhandled: ${err.message}`));
  }
}

module.exports = { createEnforcer, start, POLL_MS };
