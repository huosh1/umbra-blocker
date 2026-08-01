const standalone = new URLSearchParams(location.search).get("standalone") === "1";

const cardTextEl = document.getElementById("card-text");
const cardExampleEl = document.getElementById("card-example");
const progressEl = document.getElementById("progress");
const actionBtn = document.getElementById("action-btn");
const statusActions = document.getElementById("status-actions");
const emptyState = document.getElementById("empty-state");
const cardEl = document.querySelector(".card");

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
    cardExampleEl.innerHTML =
      `<div class="kr">${w.example_kr}</div>` + (w.example_fr ? `<div>${w.example_fr}</div>` : "");
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
