const http = require("http");
const session = require("./session");
const periods = require("./periods");
const { loadBlocklist } = require("./blocklist");

// Petit serveur HTTP local (127.0.0.1 uniquement) interrogé par l'extension
// navigateur pour savoir si un blocage est actif et quels sites bloquer.
// Le blocage hosts+pare-feu couvre tout le système ; l'extension bloque en
// plus au niveau du navigateur (plus fiable que hosts pour un navigateur
// donné, insensible aux résolveurs DNS chiffrés). Doit refléter les DEUX
// sources de blocage (session manuelle ET plages actives) - avant, seule la
// session manuelle était prise en compte ici, donc l'extension ne bloquait
// jamais rien pendant une plage sans session en cours.
const PORT = 47821;

function start() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "GET" && req.url === "/status") {
      const s = session.load();
      const sessionActive = s.active && session.remainingSeconds(s) > 0;
      const activePeriods = periods.getActivePeriods(periods.load());
      const active = sessionActive || activePeriods.length > 0;

      const sites = new Set();
      if (sessionActive) {
        try {
          (loadBlocklist().sites || []).forEach((site) => sites.add(site));
        } catch {
          // pas grave, l'extension retentera au prochain poll
        }
      }
      for (const p of activePeriods) (p.sites || []).forEach((site) => sites.add(site));

      let remainingSeconds = 0;
      if (sessionActive) remainingSeconds = session.remainingSeconds(s);
      else if (activePeriods.length) {
        remainingSeconds = Math.max(0, Math.min(...activePeriods.map((p) => periods.minutesUntilEnd(p))) * 60);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          active,
          hardMode: sessionActive ? s.hardMode : false,
          questName: sessionActive ? s.questName : (activePeriods[0] ? activePeriods[0].name : ""),
          remainingSeconds,
          sites: [...sites],
        })
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  server.on("error", () => {
    // déjà un watchdog qui écoute sur ce port, ou port pris ailleurs :
    // pas fatal, l'extension retentera au prochain poll.
  });
  server.listen(PORT, "127.0.0.1");
  return server;
}

module.exports = { start, PORT };
