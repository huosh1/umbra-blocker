const standalone = new URLSearchParams(location.search).get("standalone") === "1";

const cardTextEl = document.getElementById("card-text");
const cardExampleEl = document.getElementById("card-example");
const progressEl = document.getElementById("progress");
const actionBtn = document.getElementById("action-btn");
const statusActions = document.getElementById("status-actions");
const emptyState = document.getElementById("empty-state");
const cardEl = document.querySelector(".card");
const promptSpeakEl = document.getElementById("prompt-speak");

// Même moteur que le reste de l'app (Piper, voix neuronale hors-ligne) avec
// repli sur la voix Windows si Piper échoue pour n'importe quelle raison.
let lastAudio = null;
async function speakKorean(text) {
  if (!text) return;
  try {
    const base64 = await window.umbra.speakKoreanPiper(text);
    if (base64) {
      if (lastAudio) lastAudio.pause();
      lastAudio = new Audio(`data:audio/wav;base64,${base64}`);
      await lastAudio.play();
      return;
    }
  } catch {
    // silencieux - repli ci-dessous
  }
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ko-KR";
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}
function setPromptSpeakButton(text) {
  promptSpeakEl.innerHTML = "";
  if (!text) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "speak-btn";
  btn.title = "Écouter";
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    speakKorean(text);
  });
  promptSpeakEl.appendChild(btn);
}

// Comme côté ancienne version Python : ni Échap ni Alt+F4 ne doivent
// permettre de fermer cet écran avant la fin du défi.
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") e.preventDefault();
});

let words = [];
let index = 0;
let revealed = false;

function renderCard() {
  const w = words[index];
  progressEl.textContent = `Mot ${index + 1} / ${words.length}`;
  revealed = false;
  cardTextEl.textContent = w.korean;
  setPromptSpeakButton(w.korean);
  cardExampleEl.classList.add("hidden");
  cardExampleEl.innerHTML = "";
  actionBtn.classList.remove("hidden");
  actionBtn.textContent = "Voir la réponse";
  statusActions.classList.add("hidden");
}

function reveal() {
  const w = words[index];
  revealed = true;
  cardTextEl.textContent = w.meaning || w.korean;
  if (w.example_kr) {
    cardExampleEl.innerHTML = "";
    const krRow = document.createElement("div");
    krRow.className = "example-kr-row";
    const krDiv = document.createElement("div");
    krDiv.className = "kr";
    krDiv.textContent = w.example_kr;
    krRow.appendChild(krDiv);
    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "speak-btn";
    speakBtn.title = "Écouter";
    speakBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
    speakBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      speakKorean(w.example_kr);
    });
    krRow.appendChild(speakBtn);
    cardExampleEl.appendChild(krRow);
    if (w.example_fr) {
      const frDiv = document.createElement("div");
      frDiv.textContent = w.example_fr;
      cardExampleEl.appendChild(frDiv);
    }
    cardExampleEl.classList.remove("hidden");
  }
  actionBtn.classList.add("hidden");
  statusActions.classList.remove("hidden");
}

function advance() {
  index += 1;
  if (index >= words.length) {
    window.umbra.challengeDone(standalone);
    return;
  }
  renderCard();
}

actionBtn.addEventListener("click", () => {
  if (!revealed) reveal();
});

document.getElementById("btn-mastered").addEventListener("click", async () => {
  await window.umbra.setVocabStatus(words[index].id, "mastered");
  advance();
});
document.getElementById("btn-review").addEventListener("click", async () => {
  await window.umbra.setVocabStatus(words[index].id, "review");
  advance();
});
document.getElementById("btn-next").addEventListener("click", () => {
  advance();
});

document.getElementById("skip-btn").addEventListener("click", () => {
  window.umbra.challengeDone(standalone);
});

(async function init() {
  words = await window.umbra.pickSessionDeck();
  if (!words.length) {
    cardEl.style.display = "none";
    actionBtn.style.display = "none";
    emptyState.classList.remove("hidden");
    return;
  }
  renderCard();
})();
