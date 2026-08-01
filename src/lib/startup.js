const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const STARTUP_DIR = path.join(
  process.env.APPDATA || "",
  "Microsoft", "Windows", "Start Menu", "Programs", "Startup"
);
const LAUNCHER_NAME = "UmbraMorningChallenge.bat";

function launcherPath() {
  return path.join(STARTUP_DIR, LAUNCHER_NAME);
}

function isInstalled() {
  return fs.existsSync(launcherPath());
}

function install() {
  fs.mkdirSync(STARTUP_DIR, { recursive: true });
  const exe = process.execPath;
  const content = `@echo off\r\nstart "" "${exe}" --challenge\r\n`;
  fs.writeFileSync(launcherPath(), content, "utf-8");
}

function uninstall() {
  const p = launcherPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { isInstalled, install, uninstall, isPackaged: () => app.isPackaged };
