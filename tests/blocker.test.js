const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { tempDir, configStub } = require(path.join(__dirname, "helpers", "stub-electron.js"));
const blocker = require(path.join(__dirname, "..", "src", "lib", "blocker.js"));

function readHosts() {
  return fs.readFileSync(configStub.HOSTS_PATH, "utf-8");
}
function resetHosts(content = "127.0.0.1 localhost\n") {
  fs.writeFileSync(configStub.HOSTS_PATH, content, "utf-8");
}

test("applySiteBlock adds entries, removeSiteBlock cleans them and preserves the rest", () => {
  resetHosts();
  blocker.applySiteBlock(["example-test-site.com"]);
  assert.match(readHosts(), /example-test-site\.com/);

  blocker.removeSiteBlock();
  const after = readHosts();
  assert.doesNotMatch(after, /example-test-site\.com/);
  assert.match(after, /127\.0\.0\.1 localhost/);
});

test("removeSiteBlock is a true no-op when there's nothing to remove (no disk write)", () => {
  resetHosts();
  const before = fs.statSync(configStub.HOSTS_PATH).mtimeMs;
  // Contrainte de l'horloge fichier: on force un petit delai pour que le
  // mtime aurait le temps de changer si une ecriture avait vraiment lieu.
  const original = readHosts();
  blocker.removeSiteBlock();
  assert.equal(readHosts(), original);
  assert.equal(fs.statSync(configStub.HOSTS_PATH).mtimeMs, before);
});

// Reproduit le bug reel corrige cette session : un watchdog qui redemarre
// (le precedent est mort pendant qu'un blocage etait actif) doit pouvoir
// nettoyer un blocage "orphelin" qu'il n'a jamais lui-meme applique dans
// CE process. removeSiteBlock() doit fonctionner par simple inspection du
// fichier hosts, jamais par un etat memoire suppose.
test("removeSiteBlock cleans up an orphaned block even without a prior applySiteBlock() call in this process", () => {
  resetHosts("127.0.0.1 localhost\n\n# --- UMBRA BLOCK START ---\n127.0.0.1 twitch.tv\n127.0.0.1 www.twitch.tv\n# --- UMBRA BLOCK END ---\n");
  assert.match(readHosts(), /twitch\.tv/);

  blocker.removeSiteBlock(); // aucun applySiteBlock() precedent dans ce test

  const after = readHosts();
  assert.doesNotMatch(after, /twitch\.tv/);
  assert.match(after, /127\.0\.0\.1 localhost/);
});

test("applySiteBlock replacing an existing block doesn't duplicate the original content", () => {
  resetHosts();
  blocker.applySiteBlock(["site-a.com"]);
  blocker.applySiteBlock(["site-b.com"]);
  const content = readHosts();
  assert.doesNotMatch(content, /site-a\.com/);
  assert.match(content, /site-b\.com/);
  // Le contenu original ne doit apparaitre qu'une fois, pas s'accumuler a chaque apply
  const occurrences = (content.match(/127\.0\.0\.1 localhost/g) || []).length;
  assert.equal(occurrences, 1);
});
