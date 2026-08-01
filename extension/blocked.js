const params = new URLSearchParams(location.search);
const site = params.get("site");
document.getElementById("site").textContent = site ? `${site} est bloqué pendant cette session.` : "Ce site est bloqué pendant cette session.";

async function updateRemaining() {
  try {
    const res = await fetch("http://127.0.0.1:47821/status", { cache: "no-store" });
    const data = await res.json();
    if (data.active) {
      const s = Math.max(0, Math.round(data.remainingSeconds));
      const m = Math.floor(s / 60);
      const sec = s % 60;
      document.getElementById("remaining").textContent = `${m}:${String(sec).padStart(2, "0")} restantes`;
    } else {
      document.getElementById("remaining").textContent = "Session terminée — tu peux recharger la page.";
    }
  } catch {
    document.getElementById("remaining").textContent = "";
  }
}

updateRemaining();
setInterval(updateRemaining, 2000);
