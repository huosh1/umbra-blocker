# tsParticles preset bundles

Pre-built browser bundles from the [tsParticles](https://particles.js.org/)
project (MIT license), used for the "Neige" / "Étoiles+" / "Liens" / "Feu
d'artifice" particle effects in Focus View.

- Source: `@tsparticles/preset-{snow,fireworks,links,stars}` v4.3.2 on npm
- Each file is that package's own `tsparticles.preset.*.bundle.min.js`
  (engine + preset bundled together), copied here as-is - no CDN, no build
  step, works entirely offline like the rest of the app.
- Upstream repo: https://github.com/tsparticles/tsparticles

To update: `npm install @tsparticles/preset-<name>@latest --no-save`, then
copy `node_modules/@tsparticles/preset-<name>/tsparticles.preset.<name>.bundle.min.js`
over the matching file here.
