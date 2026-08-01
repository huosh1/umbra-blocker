const http = require("http");
const session = require("./session");
const { loadBlocklist } = require("./blocklist");

// Petit serveur HTTP local (127.0.0.1 uniquement) interrogé par l'extension
// navigateur pour savoir si une session est active et quels sites bloquer.
// Le blocage hosts+pare-feu couvre tout le système ; l'extension bloque en
// plus au niveau du navigateur (plus fiable que hosts pour un navigateur
// donné, insensible aux résolveurs DNS chiffrés).
const PORT = 47821;

function start() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "GET" && req.url === "/status") {
      const s = session.load();
      const active = s.active && session.remainingSeconds(s) > 0;
      const bl = active ? loadBlocklist() : { sites: [] };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          active,
          hardMode: s.hardMode,
          questName: s.questName,
          remainingSeconds: session.remainingSeconds(s),
          sites: bl.sites || [],
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
