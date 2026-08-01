const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// asar ne peut pas être lu directement par un process externe (powershell.exe
// -File a besoin d'un vrai chemin disque) : le .ps1 est extrait tel quel
// via la config "asarUnpack" d'electron-builder, d'où la substitution de
// chemin ci-dessous (no-op en dev, où __dirname ne contient pas "app.asar").
const SCRIPT_PATH = path.join(__dirname, "spotify_nowplaying.ps1").replace("app.asar", "app.asar.unpacked");
const PS_EXE = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
);

// Interroge les Global System Media Transport Controls de Windows (voir
// spotify_nowplaying.ps1) pour la piste en cours dans Spotify. Ne nécessite
// ni élévation ni compte/API Spotify : fonctionne pour n'importe quel
// lecteur enregistré auprès de l'OS (Spotify, navigateur, etc.), on filtre
// juste sur la source "Spotify".
async function getNowPlaying() {
  try {
    const { stdout } = await execFileAsync(
      PS_EXE,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT_PATH],
      { timeout: 5000, maxBuffer: 10 * 1024 * 1024 }
    );
    const data = JSON.parse(stdout.trim());
    if (!data.title) return { playing: false };
    let thumbnailDataUrl = null;
    if (data.thumbnail) {
      const mime = data.thumbnail.startsWith("/9j/") ? "image/jpeg" : "image/png";
      thumbnailDataUrl = `data:${mime};base64,${data.thumbnail}`;
    }
    return {
      playing: !!data.playing,
      title: data.title || "",
      artist: data.artist || "",
      thumbnailDataUrl,
    };
  } catch {
    return { playing: false };
  }
}

module.exports = { getNowPlaying };
