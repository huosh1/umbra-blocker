const fs = require("fs");
const { SETTINGS_FILE } = require("./config");

function defaultSettings() {
  return {
    language: "fr", // "fr" | "en"
    theme: "umbra", // "umbra" | "lavender" | "midnight" | "sakura"
    durationPresets: [25, 60, 180], // minutes
    background: { path: null, type: null, blur: true }, // type: null | "image" | "video"
    particles: "none", // "none" | "ts-snow" | "ts-links" | "ts-fireworks"
    soundEnabled: true,
  };
}

function load() {
  if (!fs.existsSync(SETTINGS_FILE)) return defaultSettings();
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    const background = { ...defaultSettings().background, ...(data.background || {}) };
    // migration : l'ancien schéma stockait juste { imagePath, blur }
    if (!background.path && data.background && data.background.imagePath) {
      background.path = data.background.imagePath;
      background.type = "image";
    }
    return { ...defaultSettings(), ...data, background };
  } catch {
    return defaultSettings();
  }
}

function save(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

module.exports = { load, save, defaultSettings };
