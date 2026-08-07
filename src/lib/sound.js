const path = require("path");
const { spawn } = require("child_process");

// Sons courts (WAV) joués via System.Media.SoundPlayer en PowerShell -
// cohérent avec le reste de l'app qui shell-out déjà vers PowerShell pour
// tout ce qui touche à l'OS, plutôt que de gérer une fenêtre cachée juste
// pour lire un <audio>.
const SOUNDS_DIR = path.join(__dirname, "..", "..", "assets", "sounds").replace("app.asar", "app.asar.unpacked");
const PS_EXE = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
);

const FILES = {
  "phase-change": "phase-change.wav",
  "session-complete": "session-complete.wav",
};

// Fire-and-forget : un son qui échoue à jouer ne doit jamais faire planter
// ou ralentir le tick du watchdog qui l'a déclenché.
function playSound(name) {
  const file = FILES[name];
  if (!file) return;
  const filePath = path.join(SOUNDS_DIR, file);
  const psCommand = `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`;
  try {
    const child = spawn(
      PS_EXE,
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", psCommand],
      { stdio: "ignore", windowsHide: true }
    );
    child.on("error", () => {
      // best-effort, comme le reste des appels PowerShell de l'app
    });
  } catch {
    // idem
  }
}

module.exports = { playSound };
