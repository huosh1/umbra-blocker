const fs = require("fs");
const { BLOCKLIST_FILE } = require("./config");

function loadBlocklist() {
  if (!fs.existsSync(BLOCKLIST_FILE)) return { apps: [], sites: [] };
  try {
    const data = JSON.parse(fs.readFileSync(BLOCKLIST_FILE, "utf-8"));
    return { apps: data.apps || [], sites: data.sites || [] };
  } catch {
    return { apps: [], sites: [] };
  }
}

function saveBlocklist(data) {
  fs.writeFileSync(
    BLOCKLIST_FILE,
    JSON.stringify({ apps: data.apps || [], sites: data.sites || [] }, null, 2),
    "utf-8"
  );
}

module.exports = { loadBlocklist, saveBlocklist };
