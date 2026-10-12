/* The globe: coastlines, routes that arc over the sphere, and a drag that
   behaves like a real object you have hold of.

   createGlobe() returns an object the rest of the app talks to:
     setRoutes(list)   list of { id, from:[lon,lat], to:[lon,lat], … }
     select(route)     fly to a route and draw it in
     play(route)       frame a route and send the letter along it
     flyTo([lon,lat])  turn the globe to face a point
     spin(on)
     draw()
*/

import {
  geoOrthographic, geoPath, geoGraticule10, geoInterpolate, geoDistance,
  geoRotation, feature, timer,
} from "./vendor/geo.js";

/* ── quaternion helpers (versor dragging) ───────────────────────────────── */
const cart = ([l, p]) => {
  l *= Math.PI / 180; p *= Math.PI / 180;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
};
const fromAngles = ([l, p, g]) => {
  l *= Math.PI / 360; p *= Math.PI / 360; g = (g || 0) * Math.PI / 360;
  const sl = Math.sin(l), cl = Math.cos(l), sp = Math.sin(p),
        cp = Math.cos(p), sg = Math.sin(g), cg = Math.cos(g);
  return [cl * cp * cg + sl * sp * sg, sl * cp * cg - cl * sp * sg,
          cl * sp * cg + sl * cp * sg, cl * cp * sg - sl * sp * cg];
};
const toAngles = ([a, b, c, d]) => [
  Math.atan2(2 * (a * b + c * d), 1 - 2 * (b * b + c * c)) * 180 / Math.PI,
  Math.asin(Math.max(-1, Math.min(1, 2 * (a * c - d * b)))) * 180 / Math.PI,
  Math.atan2(2 * (a * d + b * c), 1 - 2 * (c * c + d * d)) * 180 / Math.PI,
];
const multiply = ([a1, b1, c1, d1], [a2, b2, c2, d2]) => [
  a1 * a2 - b1 * b2 - c1 * c2 - d1 * d2, a1 * b2 + b1 * a2 + c1 * d2 - d1 * c2,
  a1 * c2 - b1 * d2 + c1 * a2 + d1 * b2, a1 * d2 + b1 * c2 - c1 * b2 + d1 * a2,
];
const invert = ([a, b, c, d]) => [a, -b, -c, -d];

/** The smallest rotation carrying unit vector v0 onto v1. */
function delta(v0, v1) {
  const w = [v0[1] * v1[2] - v0[2] * v1[1],
             v0[2] * v1[0] - v0[0] * v1[2],
             v0[0] * v1[1] - v0[1] * v1[0]];
  const len = Math.hypot(w[0], w[1], w[2]);
  if (!len) return [1, 0, 0, 0];
  const dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const t = Math.acos(Math.max(-1, Math.min(1, dot))) / 2, s = Math.sin(t);
  return [Math.cos(t), w[2] / len * s, -w[1] / len * s, w[0] / len * s];
}
/** Multiply a rotation's angle by k, keeping its axis. */
function scaleAngle(q, k) {
  const a = Math.acos(Math.max(-1, Math.min(1, q[0]))), s = Math.sin(a);
  if (s < 1e-9) return [1, 0, 0, 0];
  const a2 = a * k, f = Math.sin(a2) / s;
  return [Math.cos(a2), q[1] * f, q[2] * f, q[3] * f];
}

/* `insets()` returns how much of the window the glass covers on each side, so
   the globe centres itself in the space that is actually visible. */
export async function createGlobe({ canvas, stage, tip, config, onPick, onHover, insets, small = false }) {
  // `small` draws lines and dots finer, for the minimap in the detail view.
  const k = small ? 0.6 : 1;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const topo = await (await fetch("assets/land-50m.json")).json();
  const land = feature(topo, topo.objects.land);
  const grat = geoGraticule10();

  const proj = geoOrthographic().clipAngle(90).precision(0.4)
    .rotate([-config.initial_rotate[0], -config.initial_rotate[1]]);
  const path = geoPath(proj, ctx);

  let W = 0, H = 0, cx = 0, cy = 0, baseScale = 1, zoom = 1;
  let routes = [], selected = null, progress = 1, traveller = false;
  let arcs = [], dots = [], colors = {};

  const css = () => getComputedStyle(document.documentElement);
  function readColors() {
    const s = css(), g = (n) => s.getPropertyValue("--" + n).trim();
    colors = { ocean: g("ocean"), land: g("land"), coast: g("coast"),
               cachet: g("cachet"), postmark: g("postmark"), card: g("card") };
  }

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const i = insets ? insets() : { top: 0, right: 0, bottom: 0, left: 0 };
    const least = small ? 20 : 200;                // the big globe never gets smaller than this
    const freeW = Math.max(least, W - i.left - i.right), freeH = Math.max(least, H - i.top - i.bottom);
    cx = i.left + freeW / 2;
    cy = i.top + freeH / 2;
    baseScale = Math.min(freeW, freeH) / 2.2;
    proj.translate([cx, cy]).scale(baseScale * zoom);
    draw();
  }

  /** Project a point at height h above the surface. Returns [x, y, visible]. */
  function project3(lon, lat, h) {
    const [l, p] = geoRotation(proj.rotate())([lon, lat]).map((d) => d * Math.PI / 180);
    const x = Math.cos(p) * Math.sin(l), y = Math.sin(p), z = Math.cos(p) * Math.cos(l);
    const R = proj.scale() * (1 + h);
    // A lifted point stays visible past the horizon once it clears the silhouette.
    const visible = z >= 0 || (x * x + y * y) * (1 + h) ** 2 > 1;
    return [cx + R * x, cy - R * y, visible];
  }

  function arcPoints(route, upto = 1) {
    const n = config.arc_samples, pts = [];
    const lift = Math.min(config.arc_lift, 0.08 + route.dist / Math.PI * 0.28);
    for (let i = 0; i <= n * upto; i++) {
      const t = i / n, [lon, lat] = route.gc(t);
      pts.push(project3(lon, lat, lift * Math.sin(Math.PI * t)));
    }
    return pts;
  }

  function strokeRuns(pts) {
    ctx.beginPath();
    let pen = false;
    for (const [x, y, vis] of pts) {
      if (vis) { pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
      else pen = false;
    }
    ctx.stroke();
  }

  function draw() {
    if (!W) return;
    const R = proj.scale();
    ctx.clearRect(0, 0, W, H);

    // A soft atmosphere: the one place the globe is allowed to glow.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.16);
    halo.addColorStop(0, colors.cachet + "40");
    halo.addColorStop(1, colors.cachet + "00");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, 7); ctx.fill();

    ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = colors.ocean; ctx.fill();
    ctx.beginPath(); path(grat); ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); path(land); ctx.fillStyle = colors.land; ctx.fill();
    ctx.strokeStyle = colors.coast; ctx.lineWidth = 0.5; ctx.stroke();

    arcs = []; dots = [];
    const anySel = selected && routes.includes(selected);
    ctx.lineCap = "round";

    for (const route of routes) {
      const isSel = route === selected;
      const pts = arcPoints(route, isSel ? progress : 1);
      arcs.push({ route, pts });
      ctx.strokeStyle = colors.cachet;
      ctx.globalAlpha = anySel ? (isSel ? 1 : 0.16) : 0.7;
      ctx.lineWidth = (isSel ? 2.6 : 1.3) * k;
      strokeRuns(pts);
    }
    ctx.globalAlpha = 1;

    const seen = new Set();
    for (const route of routes) {
      for (const [pt, kind] of [[route.from, "o"], [route.to, "d"]]) {
        const id = kind + pt.join(",");
        if (seen.has(id)) continue;
        seen.add(id);
        const [x, y, vis] = project3(pt[0], pt[1], 0);
        if (!vis) continue;
        const on = anySel && (selected.from === pt || selected.to === pt
                   || selected.from.join() === pt.join() || selected.to.join() === pt.join());
        ctx.globalAlpha = anySel && !on ? 0.3 : 1;
        ctx.beginPath(); ctx.arc(x, y, (kind === "o" ? 5 : 4) * k, 0, 7);
        if (kind === "o") { ctx.fillStyle = colors.land; ctx.fill();
                            ctx.lineWidth = 2; ctx.strokeStyle = colors.cachet; ctx.stroke(); }
        else { ctx.fillStyle = colors.postmark; ctx.fill(); }
        dots.push({ x, y, kind, pt });
      }
    }
    ctx.globalAlpha = 1;

    // The letter on its way: a bright dot at the head of the line while the
    // journey plays (see play()).
    if (traveller && anySel) {
      const head = arcs.find((a) => a.route === selected).pts.at(-1);
      if (head && head[2]) {
        const [x, y] = head;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
        glow.addColorStop(0, colors.cachet + "66"); glow.addColorStop(1, colors.cachet + "00");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fillStyle = colors.cachet; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = colors.land; ctx.stroke();
      }
    }
  }

  /* ── gestures ─────────────────────────────────────────────────────────── */
  const pointers = new Map();
  let gesture = null, moved = 0, spinning = false, inertia = null;
  const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  function begin() {
    const ps = [...pointers.values()];
    const mid = ps.length > 1 ? [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2] : ps[0];
    const geo = proj.invert(mid);
    gesture = geo ? {
      r0: proj.rotate(), q0: fromAngles(proj.rotate()), v0: cart(geo),
      dist: ps.length > 1 ? Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]) : 0,
      zoom0: zoom, q: fromAngles(proj.rotate()), t: performance.now(), dq: [1, 0, 0, 0],
    } : null;
  }

  function stopInertia() { if (inertia) { inertia.stop(); inertia = null; } }

  function levelOff() {
    const r = proj.rotate();
    if (!config.level_north || Math.abs(r[2]) < 0.4 || reduce) {
      if (r[2]) { proj.rotate([r[0], r[1], 0]); draw(); }
      return;
    }
    const g0 = r[2];
    const t = timer((ms) => {
      const k = Math.min(1, ms / 550), cur = proj.rotate();
      proj.rotate([cur[0], cur[1], g0 * (1 - (1 - (1 - k) ** 3))]);
      draw();
      if (k === 1) t.stop();
    });
  }

  function startInertia(dq) {
    if (reduce || Math.acos(Math.max(-1, Math.min(1, dq[0]))) * 2 < 0.004) { levelOff(); return; }
    let q = fromAngles(proj.rotate()), k = 1;
    inertia = timer(() => {
      k *= config.inertia_decay;
      q = multiply(q, scaleAngle(dq, k));
      proj.rotate(toAngles(q)); draw();
      if (k < 0.04) { stopInertia(); levelOff(); }
    });
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, at(e));
    moved = 0; stopInertia(); spin(false);
    canvas.classList.add("dragging");
    begin();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) { hover(e); return; }
    const p = at(e), prev = pointers.get(e.pointerId);
    moved += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    pointers.set(e.pointerId, p);
    if (!gesture) { begin(); return; }

    const ps = [...pointers.values()];
    if (ps.length > 1 && gesture.dist) {
      const d = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]);
      zoom = Math.max(config.min_zoom, Math.min(config.max_zoom, gesture.zoom0 * d / gesture.dist));
      proj.scale(baseScale * zoom);
    }
    const mid = ps.length > 1 ? [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2] : ps[0];
    proj.rotate(gesture.r0);                       // rewind: both points in one frame
    const now = proj.invert(mid);
    if (!now) { proj.rotate(toAngles(gesture.q)); draw(); return; }
    const q = multiply(gesture.q0, delta(gesture.v0, cart(now)));
    const t = performance.now(), dt = Math.max(8, t - gesture.t);
    gesture.dq = scaleAngle(multiply(invert(gesture.q), q), 16 / dt);
    gesture.q = q; gesture.t = t;
    proj.rotate(toAngles(q)); draw();
  }, { passive: true });

  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      canvas.classList.remove("dragging");
      if (gesture && performance.now() - gesture.t < 120) startInertia(gesture.dq);
      else levelOff();
      gesture = null;
    } else begin();
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function setZoom(z, point) {
    const next = Math.max(config.min_zoom, Math.min(config.max_zoom, z));
    if (next === zoom) return;
    const geo = point ? proj.invert(point) : null;
    zoom = next; proj.scale(baseScale * zoom);
    if (geo) {
      const now = proj.invert(point);
      if (now) proj.rotate(toAngles(multiply(fromAngles(proj.rotate()), delta(cart(geo), cart(now)))));
    }
    draw();
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); stopInertia(); spin(false);
    setZoom(zoom * Math.exp(-e.deltaY * 0.0015), at(e));
  }, { passive: false });

  canvas.addEventListener("dblclick", (e) => { stopInertia(); setZoom(zoom * 1.6, at(e)); });

  canvas.addEventListener("keydown", (e) => {
    const r = proj.rotate(), step = e.shiftKey ? 15 : 5;
    const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); spin(false);
             proj.rotate([r[0] + d[0], Math.max(-90, Math.min(90, r[1] + d[1])), r[2]]); draw(); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(zoom * 1.25); }
    else if (e.key === "-") { e.preventDefault(); setZoom(zoom / 1.25); }
  });

  /* ── hit testing ──────────────────────────────────────────────────────── */
  function nearest(mx, my) {
    let best = null, bd = 10;
    for (const d of dots) {
      const dd = Math.hypot(d.x - mx, d.y - my);
      if (dd < bd) { bd = dd; best = { dot: d }; }
    }
    if (best) return best;
    bd = 7;
    for (const a of arcs) for (const [x, y, vis] of a.pts) {
      if (!vis) continue;
      const dd = Math.hypot(x - mx, y - my);
      if (dd < bd) { bd = dd; best = { route: a.route }; }
    }
    return best;
  }

  function hover(e) {
    const [mx, my] = at(e), hit = nearest(mx, my);
    if (!hit) { tip.style.opacity = 0; return; }
    tip.innerHTML = onHover(hit);
    tip.style.opacity = 1;
    tip.style.left = Math.min(mx + 14, W - 280) + "px";
    tip.style.top = (my + 14) + "px";
  }
  canvas.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
  canvas.addEventListener("click", (e) => {
    if (moved > 5) return;
    const hit = nearest(...at(e));
    if (hit) onPick(hit);
  });

  /* ── animation ────────────────────────────────────────────────────────── */
  function flyTo(target, ms = 900, toZoom = zoom) {
    stopInertia(); spin(false);
    const from = proj.rotate(), z0 = zoom;
    const setZ = (z) => { zoom = z; proj.scale(baseScale * zoom); };
    let dl = -target[0] - from[0];
    dl = ((dl + 540) % 360) - 180;
    const to = [from[0] + dl, -target[1], 0];
    if (reduce) { proj.rotate(to); setZ(toZoom); draw(); return Promise.resolve(); }
    return new Promise((done) => {
      const t = timer((ms2) => {
        const k = Math.min(1, ms2 / ms), e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
        proj.rotate([from[0] + (to[0] - from[0]) * e,
                     from[1] + (to[1] - from[1]) * e,
                     from[2] + (to[2] - from[2]) * e]);
        setZ(z0 * Math.pow(toZoom / z0, e));        // zoom evenly, as the eye sees it
        draw();
        if (k === 1) { t.stop(); done(); }
      });
    });
  }

  let drawing = null;
  function drawIn(ms = 900, ease = (k) => 1 - (1 - k) ** 3) {
    if (drawing) drawing.stop();
    if (reduce) { progress = 1; draw(); return Promise.resolve(); }
    progress = 0;
    return new Promise((done) => {
      drawing = timer((t) => {
        const k = Math.min(1, t / ms);
        progress = ease(k);
        draw();
        if (k === 1) { drawing.stop(); drawing = null; done(); }
      });
    });
  }

  /** The zoom at which the whole of a route fits in the free space, both ends
      and the lifted arc between them. */
  function fitZoom(route) {
    const half = Math.min(Math.PI / 2, route.dist / 2 + 0.12);
    return Math.max(1, Math.min(config.max_zoom, 3, 0.82 / Math.sin(half)));
  }

  let spinTimer = null;
  function spin(on) {
    if (on === undefined) on = !spinTimer;
    if (!on) { if (spinTimer) { spinTimer.stop(); spinTimer = null; } return false; }
    let last = 0;
    spinTimer = timer((ms) => {
      if (last) { const r = proj.rotate(); proj.rotate([r[0] + (ms - last) * 0.006, r[1], r[2]]); draw(); }
      last = ms;
    });
    return true;
  }

  readColors();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); draw(); });
  new ResizeObserver(resize).observe(stage);

  return {
    draw,
    resize,
    spin,
    flyTo,
    isSpinning: () => !!spinTimer,
    setRoutes(list) {
      routes = list.map((r) => ({
        ...r,
        gc: geoInterpolate(r.from, r.to),
        dist: geoDistance(r.from, r.to),
      }));
      if (selected && !routes.some((r) => r.id === selected.id)) selected = null;
      else if (selected) selected = routes.find((r) => r.id === selected.id);
      draw();
    },
    routes: () => routes,
    select(route) {
      traveller = false;
      selected = route ? routes.find((r) => r.id === route.id) || null : null;
      if (!selected) { draw(); return Promise.resolve(); }
      const [lon, lat] = selected.gc(0.5);
      return flyTo([lon, lat * 0.9], 900).then(() => drawIn());
    },
    /** Play a letter's journey: frame the whole route, then send a dot along
        it from where it was posted to where it was delivered. */
    async play(route) {
      selected = routes.find((r) => r.id === route.id) || null;
      if (!selected) return;
      const [lon, lat] = selected.gc(0.5);
      progress = 0; traveller = false;
      await flyTo([lon, lat * 0.9], 800, small ? 1 : fitZoom(selected));   // the minimap stays a whole globe
      traveller = true;
      await drawIn(Math.min(3200, 1400 + selected.dist * 900), (k) => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
      traveller = false;
      draw();
    },
  };
}
