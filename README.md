# Umbra

A Windows desktop focus blocker: lock yourself out of distracting apps and
websites during a work session. Built with Electron.

## Features

- **Session modes** — Free (custom duration), Pomodoro (work/break cycles),
  and recurring Periods (e.g. every weekday 8–12, blocks automatically with
  no session to start).
- **Hard Mode** — once started, a session can't be stopped early from the
  UI. The only way out is deliberately killing the background watchdog
  process in Task Manager — intentionally inconvenient, not literally
  impossible.
- **Site + app blocking** — system-wide via the Windows `hosts` file and a
  firewall rule (blocks common DNS-over-HTTPS resolvers so browsers can't
  bypass `hosts`), plus an optional browser extension for more reliable,
  per-tab blocking with a proper "session in progress" screen instead of a
  broken connection.
- **Per-period blocklists** — each recurring Period can have its own
  apps/sites, or reuse the global list with one click.
- **Focus View** — a full-screen, distraction-free view shown during an
  active session: big timer, your own background image/video (blur
  optional), canvas-drawn ambient particles (stars/wind), and a Spotify
  "now playing" widget (via Windows' System Media Transport Controls — no
  Spotify account/API needed).
- **Korean vocabulary trainer** — a daily flashcard challenge (optionally
  forced at Windows startup) backed by a searchable word database with
  new/review/mastered tracking, and an importer for your own word lists
  (`.txt`/`.csv`/`.tsv`/`.json`). Ships with ~6000 words by default (see
  [`data/vocab/SOURCE.md`](data/vocab/SOURCE.md) for sourcing/licensing).
- **4 themes** (dark and light) + French/English UI.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 18+ (only needed to build from source)

## Getting started

```bash
git clone https://github.com/huosh1/umbra-blocker.git
cd umbra-blocker
npm install
```

Run in dev mode:

```bash
npm start
```

Build a portable `.exe`:

```bash
npm run build
```

This produces `dist/Umbra.exe` (self-extracting portable) and
`dist/win-unpacked/Umbra.exe` (same app, unpacked — prefer running this one
directly; the portable stub re-extracts to a new temp folder on every
launch, which breaks the self-elevation the watchdog relies on). `run.bat`
already points at the unpacked exe.

> **Windows without Developer Mode enabled:** `electron-builder` tries to
> fetch a code-signing toolchain that needs symlink privileges. If the
> build fails on that step, run with signing disabled:
> `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build` (or enable Developer
> Mode in Windows Settings).

Optional: build a proper NSIS installer instead of a portable exe with
`npm run build:installer`.

## Windows SmartScreen warning

The exe isn't code-signed (a signing certificate costs money and requires a
registered identity), so Windows SmartScreen will show **"Windows protected
your PC"** the first time you run it. This is expected for any app built
from source without a paid certificate — it doesn't mean anything was
detected, just that the publisher isn't (yet) verified.

To run it anyway: click **More info**, then **Run anyway**.

If you'd rather not trust a random binary, the
[`build.yml`](.github/workflows/build.yml) GitHub Actions workflow builds
`dist/win-unpacked` straight from this repo's source on every push, so you
can compare a release against a build you triggered yourself (Actions tab →
select a run → download the `umbra-windows` artifact), or just build
locally with `npm run build` as described above.

## Why does it ask for admin rights?

Blocking sites requires writing to `C:\Windows\System32\drivers\etc\hosts`
and adding a firewall rule — both need elevation. Umbra elevates only the
background enforcement process (via a UAC prompt on the first session you
start), not the dashboard itself.

## Browser extension (recommended)

The `hosts`-based blocking works everywhere but shows a plain connection
error. The bundled extension blocks per-tab and shows a proper "session in
progress" screen instead:

1. In the app, go to **Blocking** → **Open extension folder**.
2. In your Chromium browser (Vivaldi, Chrome, Edge, Brave), open
   `<browser>://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder that opened.

## Shipping an update

The app checks `https://api.github.com/repos/<repo>/releases/latest` on
startup (and once a day after that) and shows an in-app banner if a newer
version is found. For that to have anything to find:

1. Bump `"version"` in `package.json` (semver, no leading `v`).
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Create a GitHub Release from that tag (`gh release create vX.Y.Z` or via
   the GitHub UI) with the version notes in the release body.

Plain commits to `main` are invisible to the checker - it only looks at
Releases, not commit history.

## Project structure

```
main.js               Electron main process (window, tray, IPC, watchdog spawn)
preload.js             contextBridge API exposed to the renderer
src/lib/                Backend logic (session, blocker, periods, vocab, spotify, ...)
src/renderer/            Dashboard UI, Focus View, morning challenge screen
extension/              Browser extension (Manifest V3)
data/                   Default blocklist, deck, and vocab content (bundled at build time)
```

## License

MIT — see [LICENSE](LICENSE). Third-party asset/data licenses are
documented where used (see `data/vocab/SOURCE.md`).
