const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { configStub } = require(path.join(__dirname, "helpers", "stub-electron.js"));
const vocab = require(path.join(__dirname, "..", "src", "lib", "vocab.js"));

const VOCAB_DIR = path.join(configStub.DATA_DIR, "vocab");
const PROGRESS_FILE = path.join(configStub.DATA_DIR, "vocab_progress.json");

function seedWords(words) {
  fs.mkdirSync(VOCAB_DIR, { recursive: true });
  for (const f of fs.readdirSync(VOCAB_DIR)) fs.unlinkSync(path.join(VOCAB_DIR, f));
  fs.writeFileSync(path.join(VOCAB_DIR, "test.json"), JSON.stringify(words), "utf-8");
}

function seedProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress), "utf-8");
}

test("pickPracticeWords: filters by the requested statuses only", () => {
  seedWords([
    { id: "w1", korean: "하나", meaning: "one" },
    { id: "w2", korean: "둘", meaning: "two" },
    { id: "w3", korean: "셋", meaning: "three" },
  ]);
  seedProgress({ w1: "mastered", w2: "review" }); // w3 reste "new" par defaut

  const reviewOnly = vocab.pickPracticeWords({ statuses: ["review"] });
  assert.deepEqual(reviewOnly.map((w) => w.id), ["w2"]);

  const newAndReview = vocab.pickPracticeWords({ statuses: ["new", "review"] }).map((w) => w.id).sort();
  assert.deepEqual(newAndReview, ["w2", "w3"]);
});

test("pickPracticeWords: defaults to every status when none is specified", () => {
  seedWords([{ id: "w1", korean: "하나", meaning: "one" }]);
  seedProgress({});
  assert.equal(vocab.pickPracticeWords().length, 1);
});

test("pickPracticeWords: respects the count limit without erroring when count exceeds the pool", () => {
  seedWords([
    { id: "w1", korean: "하나", meaning: "one" },
    { id: "w2", korean: "둘", meaning: "two" },
  ]);
  seedProgress({});
  assert.equal(vocab.pickPracticeWords({ count: 1 }).length, 1);
  assert.equal(vocab.pickPracticeWords({ count: 50 }).length, 2);
});

test("pickPracticeWords: can include mastered words on demand (unlike the morning challenge)", () => {
  seedWords([{ id: "w1", korean: "하나", meaning: "one" }]);
  seedProgress({ w1: "mastered" });
  assert.deepEqual(vocab.pickPracticeWords({ statuses: ["mastered"] }).map((w) => w.id), ["w1"]);
});
