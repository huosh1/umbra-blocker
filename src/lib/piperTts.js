const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PIPER_DIR } = require("./config");

const PIPER_EXE = path.join(PIPER_DIR, "piper.exe");
const MODEL_PATH = path.join(PIPER_DIR, "ko_KR-kss-medium.onnx");

function isAvailable() {
  return fs.existsSync(PIPER_EXE) && fs.existsSync(MODEL_PATH);
}

// Synthèse locale hors-ligne (moteur Piper, voix neuronale coréenne KSS) -
// gratuite, sans clé API, sans dépendance réseau. Écrit dans un fichier WAV
// temporaire (Piper ne sait pas streamer facilement vers stdout sur
// Windows) puis le relit en mémoire avant de le supprimer.
function speak(text) {
  return new Promise((resolve, reject) => {
    if (!isAvailable()) {
      reject(new Error("piper binary or model not found"));
      return;
    }
    const outPath = path.join(os.tmpdir(), `umbra-piper-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    const proc = spawn(PIPER_EXE, ["--model", MODEL_PATH, "--output_file", outPath], { cwd: PIPER_DIR });

    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(outPath)) {
        reject(new Error(`piper exited with code ${code}: ${stderr}`));
        return;
      }
      fs.readFile(outPath, (err, buf) => {
        fs.unlink(outPath, () => {});
        if (err) reject(err);
        else resolve(buf);
      });
    });

    proc.stdin.write(text, "utf-8");
    proc.stdin.end();
  });
}

module.exports = { isAvailable, speak };
