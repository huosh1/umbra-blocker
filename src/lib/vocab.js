const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./config");

const VOCAB_DIR = path.join(DATA_DIR, "vocab");
const PROGRESS_FILE = path.join(DATA_DIR, "vocab_progress.json");
fs.mkdirSync(VOCAB_DIR, { recursive: true });

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Le contenu (mot/sens/exemples) vit dans des fichiers statiques dans
// data/vocab/*.json ; le statut (nouveau/à revoir/maîtrisé) vit à part dans
// vocab_progress.json, indexé par id. Ça permet d'ajouter/regénérer des
// lots de contenu sans jamais perdre la progression de l'utilisateur.
function loadAll() {
  const progress = loadProgress();
  const words = [];
  const files = fs.existsSync(VOCAB_DIR)
    ? fs.readdirSync(VOCAB_DIR).filter((f) => f.endsWith(".json")).sort()
    : [];
  for (const file of files) {
    try {
      const entries = JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, file), "utf-8"));
      for (const e of entries) {
        if (!e.id || !e.korean) continue;
        words.push({
          id: e.id,
          korean: e.korean,
          meaning: e.meaning || "",
          example_kr: e.example_kr || "",
          example_fr: e.example_fr || "",
          level: e.level || "",
          source: file,
          status: progress[e.id] || "new",
        });
      }
    } catch {
      // fichier corrompu : on l'ignore plutôt que de casser tout le chargement
    }
  }
  return words;
}

function setStatus(id, status) {
  const progress = loadProgress();
  if (status === "new") delete progress[id];
  else progress[id] = status;
  saveProgress(progress);
}

function getStats() {
  const words = loadAll();
  return {
    total: words.length,
    new: words.filter((w) => w.status === "new").length,
    review: words.filter((w) => w.status === "review").length,
    mastered: words.filter((w) => w.status === "mastered").length,
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Priorité aux mots "à revoir", puis "nouveau" - jamais de mot "maîtrisé"
// tant qu'il en reste d'autres à réviser.
function pickChallengeWords(n) {
  const words = loadAll().filter((w) => w.status !== "mastered");
  const review = shuffle(words.filter((w) => w.status === "review"));
  const fresh = shuffle(words.filter((w) => w.status === "new"));
  return [...review, ...fresh].slice(0, n);
}

// Session d'entraînement à la demande (onglet Vocabulaire) : contrairement
// au défi du matin (priorité fixe review->nouveau, jamais de maîtrisé), on
// laisse ici choisir librement quels statuts inclure - y compris rejouer
// des mots déjà maîtrisés pour entretenir la mémoire.
function pickPracticeWords({ statuses, count } = {}) {
  const wanted = new Set(statuses && statuses.length ? statuses : ["new", "review", "mastered"]);
  const words = shuffle(loadAll().filter((w) => wanted.has(w.status)));
  return count ? words.slice(0, count) : words;
}

// ---------------------------------------------------------------------
// Import de listes perso (.txt/.csv/.tsv/.json) - beaucoup de sites de
// vocabulaire coréen (TOPIK, Anki shared decks...) exportent dans un de ces
// formats. On accepte plusieurs formes courantes sans imposer un schéma strict.
// ---------------------------------------------------------------------
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
}

// slugify(korean) est presque toujours vide pour du texte coréen (il ne
// garde que a-z0-9), donc deux mots coréens différents au même index dans
// deux imports différents généreraient le même id et se percuteraient
// silencieusement. On dérive un petit hash déterministe du texte à la place.
function shortHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function normalizeImportedEntries(raw, sourceName) {
  const out = [];
  raw.forEach((item, i) => {
    let korean, meaning, example_kr = "", example_fr = "";
    if (Array.isArray(item)) {
      [korean, meaning, example_kr] = item;
    } else if (item && typeof item === "object") {
      korean = item.korean || item.front || item.term || item.word || item.question;
      meaning = item.meaning || item.back || item.definition || item.translation || item.answer;
      example_kr = item.example_kr || item.example || "";
      example_fr = item.example_fr || item.example_translation || "";
    }
    if (!korean || !meaning) return;
    out.push({
      id: `${slugify(sourceName)}_${i}_${shortHash(String(korean))}`,
      korean: String(korean).trim(),
      meaning: String(meaning).trim(),
      example_kr: example_kr ? String(example_kr).trim() : "",
      example_fr: example_fr ? String(example_fr).trim() : "",
      level: "import",
    });
  });
  return out;
}

function parseTextList(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    let parts;
    if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(";")) parts = line.split(";");
    else if (line.includes("|")) parts = line.split("|");
    else if (line.includes(",")) parts = line.split(",");
    else continue;
    entries.push(parts.map((p) => p.trim()));
  }
  return entries;
}

function importFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);
  let raw;
  if (ext === ".json") {
    const parsed = JSON.parse(content);
    raw = Array.isArray(parsed) ? parsed : parsed.cards || parsed.words || parsed.entries || [];
  } else {
    raw = parseTextList(content);
  }
  const normalized = normalizeImportedEntries(raw, baseName);
  if (!normalized.length) return { count: 0 };

  const destFile = path.join(VOCAB_DIR, `custom_${slugify(baseName)}.json`);
  let existing = [];
  if (fs.existsSync(destFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(destFile, "utf-8"));
    } catch {
      existing = [];
    }
  }
  const existingIds = new Set(existing.map((e) => e.id));
  const toAdd = normalized.filter((e) => !existingIds.has(e.id));
  fs.writeFileSync(destFile, JSON.stringify([...existing, ...toAdd], null, 2), "utf-8");
  return { count: toAdd.length, file: path.basename(destFile) };
}

module.exports = { loadAll, setStatus, getStats, pickChallengeWords, pickPracticeWords, importFile };
