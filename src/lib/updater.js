const https = require("https");

const REPO = "huosh1/umbra-blocker";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// null si pas de release publiée ou erreur réseau - jamais fatal, l'appli
// doit continuer à fonctionner normalement sans connexion.
function fetchLatestRelease() {
  return new Promise((resolve) => {
    const req = https.get(
      API_URL,
      { headers: { "User-Agent": "Umbra-App" }, timeout: 8000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function checkForUpdate(currentVersion) {
  const release = await fetchLatestRelease();
  if (!release || !release.tag_name) return { available: false, currentVersion };
  const latestVersion = release.tag_name.replace(/^v/i, "");
  const available = compareVersions(latestVersion, currentVersion) > 0;
  return {
    available,
    currentVersion,
    latestVersion,
    url: release.html_url,
    notes: release.body || "",
  };
}

module.exports = { checkForUpdate, compareVersions };
