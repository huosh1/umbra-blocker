const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PIPER_DIR } = require("./config");

const PIPER_EXE = path.join(PIPER_DIR, "piper.exe");
const MODEL_PATH = path.join(PIPER_DIR, "ko_KR-kss-medium.onnx");

// Passé la première synthèse, rester "chaud" en gardant un process piper
// vivant évite de recharger le modèle onnx (~60 Mo, ~0.6s) à chaque clic sur
// le bouton son - un mot suivant devient ~10x plus rapide (~70-150ms au lieu
// de ~700-900ms). On coupe le process après quelques minutes d'inactivité
// pour ne pas garder ce poids en mémoire toute la journée (l'app tourne en
// tray la plupart du temps sans qu'on écoute rien).
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

function isAvailable() {
  return fs.existsSync(PIPER_EXE) && fs.existsSync(MODEL_PATH);
}

function toForwardSlashes(p) {
  return p.replace(/\\/g, "/");
}

let worker = null; // { proc, queue: [{resolve, reject}], stdoutBuffer, idleTimer }

function clearIdleTimer(state) {
  if (state.idleTimer) clearTimeout(state.idleTimer);
}

function scheduleIdleShutdown(state) {
  clearIdleTimer(state);
  state.idleTimer = setTimeout(() => {
    if (worker === state) worker = null;
    state.proc.stdin.end();
    state.proc.kill();
  }, IDLE_TIMEOUT_MS);
}

function startWorker() {
  const proc = spawn(PIPER_EXE, ["--model", MODEL_PATH, "--json-input"], { cwd: PIPER_DIR });
  const state = { proc, queue: [], stdoutBuffer: "", idleTimer: null };

  proc.stdout.on("data", (chunk) => {
    state.stdoutBuffer += chunk.toString("utf-8");
    let idx;
    while ((idx = state.stdoutBuffer.indexOf("\n")) !== -1) {
      const line = state.stdoutBuffer.slice(0, idx).trim();
      state.stdoutBuffer = state.stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      const pending = state.queue.shift();
      if (pending) pending.resolve(line);
    }
  });

  const failAll = (err) => {
    for (const pending of state.queue) pending.reject(err);
    state.queue = [];
    clearIdleTimer(state);
    if (worker === state) worker = null;
  };
  proc.on("exit", () => failAll(new Error("piper process exited")));
  proc.on("error", failAll);

  return state;
}

function speak(text) {
  return new Promise((resolve, reject) => {
    if (!isAvailable()) {
      reject(new Error("piper binary or model not found"));
      return;
    }
    if (!worker) worker = startWorker();
    const state = worker;
    clearIdleTimer(state);

    const outPath = toForwardSlashes(
      path.join(os.tmpdir(), `umbra-piper-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`)
    );

    state.queue.push({
      resolve: (returnedPath) => {
        fs.readFile(returnedPath, (err, buf) => {
          fs.unlink(returnedPath, () => {});
          scheduleIdleShutdown(state);
          if (err) reject(err);
          else resolve(buf);
        });
      },
      reject: (err) => {
        scheduleIdleShutdown(state);
        reject(err);
      },
    });

    state.proc.stdin.write(JSON.stringify({ text, output_file: outPath }) + "\n", "utf-8");
  });
}

function shutdown() {
  if (!worker) return;
  const state = worker;
  worker = null;
  clearIdleTimer(state);
  state.proc.stdin.end();
  state.proc.kill();
}

module.exports = { isAvailable, speak, shutdown };
