import { useEffect, useRef } from "react";
import { FONT_TITLE, FONT_UI, THEME as T } from "./theme.js";
import { NtscFilter } from "./ntsc/index.ts";
import ntscPreset from "./ntsc/preset.json?raw";
import { DEV, artUrl } from "./release.js"; // the tape-filter tuning panel (N on the title) is a dev tool

// Card wall: four rows of card art fill the screen: the top two drift left-to-right together, the bottom two
// right-to-left. The arts are drawn at random from the card pool each time the title comes up.
const ROW_LENGTHS = [11, 10, 11, 10]; // uneven, so the rows never line up the same way twice

function pickWall(cards) {
  const arts = [...new Set(cards.map(c => c.image).filter(Boolean))];
  for (let i = arts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arts[i], arts[j]] = [arts[j], arts[i]]; }
  let at = 0;
  return ROW_LENGTHS.map(n => arts.slice(at, at += n));
}
const SECS_PER_TILE = 10; // drift speed, the same for every row whatever its length
const TILT = 0; // degrees the wall is rotated; -6 gives the slanted look
const WALL_CONTRAST = 1.35, WALL_SATURATE = 1.35; // the wall is pushed hard on both
// The wall is painted on a small backbuffer (short side this many pixels) so the tape filter
// (src/ntsc, settings in src/ntsc/preset.json) works on a tape-sized picture: larger than the 480p it is modelled against, which keeps the blur down.
const BUFFER_SHORT = 720, BUFFER_LONG_MAX = 1440;
const TILE_PX = 160; // arts are baked once at this size, contrast and saturation included

// One art, graded like CSS contrast() then saturate() (canvas filters are not in every browser).
function bakeTile(img) {
  const c = document.createElement("canvas");
  c.width = c.height = TILE_PX;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, TILE_PX, TILE_PX);
  const px = ctx.getImageData(0, 0, TILE_PX, TILE_PX), d = px.data;
  const con = v => Math.min(255, Math.max(0, (v - 127.5) * WALL_CONTRAST + 127.5));
  for (let i = 0; i < d.length; i += 4) {
    const r = con(d[i]), g = con(d[i + 1]), b = con(d[i + 2]);
    const l = .213 * r + .715 * g + .072 * b;
    d[i] = l + (r - l) * WALL_SATURATE; d[i + 1] = l + (g - l) * WALL_SATURATE; d[i + 2] = l + (b - l) * WALL_SATURATE;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

// The card wall at time t (seconds): rows of framed arts, each row an endless loop.
function paintWall(ctx, w, h, t, wall, tiles) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = T.black;
  ctx.fillRect(0, 0, w, h);
  const tile = h / ROW_LENGTHS.length, pad = h * .005;
  const over = TILT ? tile * 2 : 0; // a tilted wall needs spare tiles past each edge
  if (TILT) { ctx.translate(w / 2, h / 2); ctx.rotate(TILT * Math.PI / 180); ctx.scale(1.12, 1.12); ctx.translate(-w / 2, -h / 2); }
  wall.forEach((arts, r) => {
    if (!arts.length) return;
    const n = arts.length, off = (t / SECS_PER_TILE % n) * tile;
    const x0 = r < wall.length / 2 ? off - n * tile : -off;
    for (let k = Math.floor((-over - x0) / tile); x0 + k * tile < w + over; k++) {
      const x = x0 + k * tile + pad, y = r * tile + pad, s = tile - pad * 2;
      ctx.fillStyle = T.silverDim;
      ctx.fillRect(x - 1, y - 1, s + 2, s + 2);
      ctx.fillStyle = T.black;
      ctx.fillRect(x, y, s, s);
      const art = tiles[arts[(k % n + n) % n]];
      if (art) ctx.drawImage(art, x + 1, y + 1, s - 2, s - 2);
    }
  });
}

// Logo is drawn on a small canvas and blown up with nearest-neighbour scaling, so the
// blackletter comes out in chunky pixels: banded gradient fill, dark outline, hard drop shadow.
const LOGO_PX = 84, LOGO_PAD = 8;
const LOGO_BANDS = ["#ffffff", "#fafafc", "#f0f0f5", "#e2e2ea", "#cfcfdb"];
const LOGO_OUTLINE = "#0a0a12";

function drawLogo(canvas) {
  const font = `${LOGO_PX}px ${FONT_TITLE}`;
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const m = ctx.measureText("Trinity");
  const w = Math.ceil(m.width) + LOGO_PAD * 2;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + LOGO_PAD * 2;
  canvas.width = w; canvas.height = h;

  const layer = document.createElement("canvas");
  layer.width = w; layer.height = h;
  const lctx = layer.getContext("2d", { willReadFrequently: true });
  // One hard-edged copy of the word: antialiased alpha is snapped to on/off before compositing.
  const stamp = (dx, dy, fill) => {
    lctx.clearRect(0, 0, w, h);
    lctx.font = font; lctx.textBaseline = "alphabetic"; lctx.fillStyle = fill;
    lctx.fillText("Trinity", LOGO_PAD, LOGO_PAD + m.actualBoundingBoxAscent);
    const px = lctx.getImageData(0, 0, w, h);
    for (let i = 3; i < px.data.length; i += 4) px.data[i] = px.data[i] < 128 ? 0 : 255;
    lctx.putImageData(px, 0, 0);
    ctx.drawImage(layer, dx, dy);
  };

  const bands = lctx.createLinearGradient(0, LOGO_PAD, 0, h - LOGO_PAD);
  LOGO_BANDS.forEach((c, i) => { bands.addColorStop(i / LOGO_BANDS.length, c); bands.addColorStop((i + 1) / LOGO_BANDS.length, c); });

  stamp(4, 4, "#000000");
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx || dy) stamp(dx, dy, LOGO_OUTLINE);
  stamp(0, 0, bands);
}

export default function TitleScreen({ onStart, cards }) {
  const logoRef = useRef(null);
  const wallRef = useRef(null);
  // Dev only: N opens the tape filter's tuning panel, and the title stays put while it is open.
  const tuner = useRef(null);
  const rootRef = useRef(null);
  const wall = useRef([]), tiles = useRef({}); // the rows of art picked for this showing, and each art baked

  useEffect(() => {
    let live = true;
    document.fonts.load(`${LOGO_PX}px ${FONT_TITLE}`).then(() => { if (live && logoRef.current) drawLogo(logoRef.current); });
    return () => { live = false; };
  }, []);

  // The wall is picked once, when the card pool arrives (the title is up before the pool has loaded).
  useEffect(() => {
    if (wall.current.length || !cards?.some(c => c.image)) return;
    wall.current = pickWall(cards);
    wall.current.flat().forEach(art => {
      const img = new Image();
      img.onload = () => { tiles.current[art] = bakeTile(img); };
      img.crossOrigin = "anonymous"; // the wall reads pixels back, and live art comes from another origin
      img.src = artUrl(art);
    });
  }, [cards]);

  // Card wall: painted small, run through the tape filter, and stretched over the screen.
  useEffect(() => {
    const display = wallRef.current, dctx = display.getContext("2d");
    const back = document.createElement("canvas"), bctx = back.getContext("2d", { willReadFrequently: true });
    let live = true, filter = null, raf = 0;

    // Starts clean; the filter cuts in a beat later, once the wasm is up.
    NtscFilter.create(ntscPreset).then(async f => {
      if (!live) return;
      filter = f;
      if (DEV) {
        const { NtscTuner } = await import("./ntsc/tuner.ts");
        if (live) tuner.current = new NtscTuner(f, JSON.parse(ntscPreset));
      }
    }).catch(err => console.error("[ntsc] failed to load, title runs clean:", err));

    const frame = ms => {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      const long = Math.min(BUFFER_LONG_MAX, Math.round(BUFFER_SHORT * Math.max(aspect, 1 / aspect)));
      const w = aspect >= 1 ? long : BUFFER_SHORT, h = aspect >= 1 ? BUFFER_SHORT : long;
      if (back.width !== w || back.height !== h) { back.width = w; back.height = h; }
      paintWall(bctx, w, h, ms / 1000, wall.current, tiles.current);

      const out = filter?.enabled ? filter.apply(bctx.getImageData(0, 0, w, h)) : back;
      if (display.width !== out.width || display.height !== out.height) { display.width = out.width; display.height = out.height; }
      if (out === back) dctx.drawImage(back, 0, 0); else dctx.putImageData(out, 0, 0);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      tuner.current?.destroy();
      tuner.current = null;
    };
  }, []);

  useEffect(() => {
    const start = () => { if (!tuner.current?.visible) onStart(); };
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (DEV && e.code === "KeyN" && tuner.current) {
        if (!e.repeat && !(e.target instanceof HTMLInputElement)) tuner.current.toggle();
        return;
      }
      if (e.key.length === 1 || e.key === "Enter") start();
    };
    const el = rootRef.current;
    window.addEventListener("keydown", onKey);
    el.addEventListener("click", start);
    return () => { window.removeEventListener("keydown", onKey); el.removeEventListener("click", start); };
  }, [onStart]);

  return (
    <div ref={rootRef} style={{
      position: "fixed", inset: 0, zIndex: 9000, overflow: "hidden", background: T.black, cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
    }}>
      <canvas ref={wallRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {/* Vignette + CRT scanlines */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `repeating-linear-gradient(0deg, #0000 0 2px, #0001 2px 4px), radial-gradient(ellipse at center, ${T.bg}00 0%, ${T.bg}18 60%, ${T.bg}66 100%)`
      }} />

      <canvas ref={logoRef} style={{
        position: "relative", width: "min(62vw, 110vh)", imageRendering: "pixelated",
        filter: "drop-shadow(0 0 22px #000c)", animation: "titleBob 3s steps(4) infinite"
      }} />
      {/* Subtitle sits on a full-width dark band that fades out at the sides */}
      <div style={{
        position: "relative", marginTop: "2vh", width: "100vw", boxSizing: "border-box", padding: ".9vw 0 .9vw 1.1vw", textAlign: "center", whiteSpace: "nowrap",
        fontFamily: FONT_UI, fontSize: "max(14px, 1.9vw)", fontWeight: 700, color: "#ffffff", letterSpacing: "1.1vw", textShadow: "0 0 6px #000",
        background: "linear-gradient(90deg, #0000 0%, #000d 22%, #000f 50%, #000d 78%, #0000 100%)"
      }}>THE WAR IN HEAVEN</div>
      <div style={{
        position: "relative", marginTop: "9vh", fontFamily: FONT_UI, fontSize: "max(11px, 1.25vw)", fontWeight: 700,
        color: T.legendary, letterSpacing: ".6vw", paddingLeft: ".6vw", textShadow: `2px 2px 0 ${T.black}, 0 0 10px ${T.black}, 0 0 4px ${T.black}`,
        animation: "titleBlink 1.1s steps(1) infinite"
      }}>PRESS START</div>
    </div>
  );
}
