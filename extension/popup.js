const activeView = document.getElementById("active-view");
const idleView = document.getElementById("idle-view");
const remainingEl = document.getElementById("remaining");
const questEl = document.getElementById("quest");

function formatRemaining(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

async function refresh() {
  try {
    const res = await fetch("http://127.0.0.1:47821/status", { cache: "no-store" });
    const data = await res.json();
    if (data.active) {
      remainingEl.textContent = formatRemaining(data.remainingSeconds);
      questEl.textContent = data.questName || "";
      activeView.classList.remove("hidden");
      idleView.classList.add("hidden");
    } else {
      activeView.classList.add("hidden");
      idleView.classList.remove("hidden");
    }
  } catch {
    // Umbra pas lancé ou watchdog pas encore élevé : rien à montrer
    activeView.classList.add("hidden");
    idleView.classList.remove("hidden");
  }
}

refresh();
setInterval(refresh, 2000);
