const fs = require("fs");
const { DECK_FILE } = require("./config");

function loadDeck() {
  if (!fs.existsSync(DECK_FILE)) return { cards_per_session: 10, cards: [] };
  try {
    return JSON.parse(fs.readFileSync(DECK_FILE, "utf-8"));
  } catch {
    return { cards_per_session: 10, cards: [] };
  }
}

function saveDeck(data) {
  fs.writeFileSync(DECK_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function pickSessionCards(deck) {
  const cards = [...(deck.cards || [])];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const n = deck.cards_per_session || 10;
  return cards.slice(0, n);
}

module.exports = { loadDeck, saveDeck, pickSessionCards };
