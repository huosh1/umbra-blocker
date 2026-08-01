// Effets de particules légers pour la vue focus, dessinés en canvas (pas
// d'assets externes). "stars" : points qui scintillent lentement. "wind" :
// traînées qui dérivent horizontalement, façon feuilles portées par le vent.
function createParticles(canvas) {
  const ctx = canvas.getContext("2d");
  let mode = "none";
  let particles = [];
  let raf = null;
  let w = 0;
  let h = 0;

  function resize() {
    w = canvas.width = canvas.clientWidth * devicePixelRatio;
    h = canvas.height = canvas.clientHeight * devicePixelRatio;
  }
  window.addEventListener("resize", resize);

  function seedStars() {
    particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.6 * devicePixelRatio + 0.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.6,
    }));
  }

  function seedWind() {
    particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: (20 + Math.random() * 50) * devicePixelRatio,
      speed: (0.6 + Math.random() * 1.4) * devicePixelRatio,
      drift: (Math.random() - 0.5) * 0.3,
      alpha: 0.08 + Math.random() * 0.18,
    }));
  }

  function drawStars(t) {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.0006 * p.speed + p.phase));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(235,232,250,${twinkle * 0.85})`;
      ctx.fill();
    }
  }

  function drawWind(t) {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.speed;
      p.y += p.drift;
      if (p.x - p.len > w) {
        p.x = -p.len;
        p.y = Math.random() * h;
      }
      const grad = ctx.createLinearGradient(p.x - p.len, p.y, p.x, p.y);
      grad.addColorStop(0, "rgba(200,200,240,0)");
      grad.addColorStop(1, `rgba(200,200,240,${p.alpha})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4 * devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(p.x - p.len, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  function loop(t) {
    if (mode === "stars") drawStars(t);
    else if (mode === "wind") drawWind(t);
    raf = requestAnimationFrame(loop);
  }

  function setMode(newMode) {
    mode = newMode;
    resize();
    if (mode === "stars") seedStars();
    else if (mode === "wind") seedWind();
    else ctx.clearRect(0, 0, w, h);
  }

  function start() {
    if (raf) return;
    resize();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  return { setMode, start, stop };
}
