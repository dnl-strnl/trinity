import { createContext, memo, useContext, useMemo } from "react";
import { FONT_TITLE, FONT_UI, FONT_BODY, THEME as T, TYPE_COLORS as TC, STAT_DEFS } from "../theme.js";
import { aura, getEff } from "../gameUtils.js";
import { legalActions, rulesCfg } from "../rules.js";
import { Card } from "../components.jsx";

// ─── Rules — the illustrated rulebook ───────────────────────────────────────
// Every board picture is a real position rendered with the game's own Card
// component, and the glowing cells come from rules.js legalActions, so the
// pictures can't drift from the rulebook. Numbers come from the live settings.

const ArtCtx = createContext(() => undefined);

// Cell builders for figure positions ("r,c" → cell); the viewer is always the player seat (bottom rows).
// Pass { art: "ENT-02575" } in x to pin a real card's art to that cell (Loose takes the same as an art prop);
// only the art is borrowed — the figure keeps its own stats so the captions' maths holds.
const being = (soul, mind, will, ow = "player", x = {}) => ({ cd: { type: "being", soul, mind, will }, ow, ...x });
const field = (soul, mind, will, ow = "player", x = {}) => ({ cd: { type: "field", soul, mind, will }, ow, ...x });
const equip = (soul, mind, will, ow = "player", x = {}) => ({ cd: { type: "equip", soul, mind, will }, ow, ...x });
const spell = (type, power, ow = "player", x = {}) => ({ cd: { type, power }, ow, ...x });
const down = (cell, prm = 0) => ({ ...cell, fd: true, prm });

function mkBd(cells) {
  const bd = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (const [k, cell] of Object.entries(cells)) {
    const [r, c] = k.split(",").map(Number);
    bd[r][c] = { ib: { soul: 0, mind: 0, will: 0 }, ...cell };
  }
  return bd;
}

const artKind = cd => cd.type !== "being" ? cd.type : aura(cd) > 0 ? "light" : aura(cd) < 0 ? "dark" : "zero";
const artIdx = cd => ((cd.soul || 0) + 4) * 81 + ((cd.mind || 0) + 4) * 9 + (cd.will || 0) + 4 + (cd.power || 0) * 7;

// ─── Figure pieces ──────────────────────────────────────────────────────────

const ATK = "#c05068";

function Board({ cells, hl = [], atk = [], marks = {}, arrows = [], boxes = [], dim = [], view = [0, 4, 0, 4], size = 72, labels }) {
  const pick = useContext(ArtCtx);
  const bd = mkBd(cells);
  const [r0, r1, c0, c1] = view;
  const rows = r1 - r0 + 1, cols = c1 - c0 + 1, gap = 2, pad = 2;
  const W = cols * size + (cols - 1) * gap + 2 * pad, H = rows * size + (rows - 1) * gap + 2 * pad;
  const x = c => pad + (c - c0) * (size + gap), y = r => pad + (r - r0) * (size + gap);
  const rc = k => k.split(",").map(Number);
  const inView = k => { const [r, c] = rc(k); return r >= r0 && r <= r1 && c >= c0 && c <= c1; };
  const contours = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = bd[r][c]; if (cl?.cd.type !== "field" || cl.fd) continue;
    const a = aura(cl.cd);
    contours.push({ r0: Math.max(r0, r - 1), c0: Math.max(c0, c - 1), r1: Math.min(r1, r + 1), c1: Math.min(c1, c + 1), color: a > 0 ? "#b8a060" : a < 0 ? "#8050c0" : "#8a8068" });
  }
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ position: "relative", width: W, height: H, flexShrink: 0, background: T.panel, outline: `1px solid ${T.panelBorder}`, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},${size}px)`, gridAutoRows: `${size}px`, gap, padding: pad }}>
          {Array.from({ length: rows }).map((_, i) => Array.from({ length: cols }).map((_, j) => {
            const r = r0 + i, c = c0 + j, k = `${r},${c}`, cell = bd[r][c], h = hl.includes(k);
            const zone = r < 2 ? `${T.curse}10` : r > 2 ? `${T.bless}10` : "transparent";
            return (
              <div key={k} style={{
                background: h ? `${T.silver}26` : T.gridCell, border: `1px solid ${T.panelBorder}`, borderRadius: 2,
                display: "flex", alignItems: "stretch", overflow: "hidden", padding: 1, boxSizing: "border-box",
                backgroundImage: !cell && !h ? `linear-gradient(135deg,${zone},transparent)` : "none",
              }}>
                {cell && <Card card={{ ...cell.cd, image: pick(cell.cd, cell.art) }} fill owner={cell.ow} fDown={cell.fd} noRar viewerRole="player" dim={dim.includes(k)}
                  effStats={cell.cd.type === "being" && !cell.fd ? getEff(cell.cd, bd, r, c, cell.ib) : null} />}
              </div>);
          }))}
        </div>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {contours.filter(q => q.r1 >= q.r0 && q.c1 >= q.c0).map((q, i) => <rect key={`f${i}`} x={x(q.c0)} y={y(q.r0)} width={x(q.c1) + size - x(q.c0)} height={y(q.r1) + size - y(q.r0)} fill={q.color} fillOpacity={0.06} stroke={q.color} strokeWidth={1.5} opacity={0.75} rx={3} />)}
          {boxes.map(([br0, bc0, br1, bc1, color = T.silver], i) => <rect key={`b${i}`} x={x(bc0) - 1} y={y(br0) - 1} width={x(bc1) + size - x(bc0) + 2} height={y(br1) + size - y(br0) + 2} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="5 4" rx={3} />)}
          {hl.filter(inView).map(k => { const [r, c] = rc(k); return <rect key={`h${k}`} x={x(c) + 1} y={y(r) + 1} width={size - 2} height={size - 2} fill="none" stroke={T.silverBright} strokeWidth={1.5} rx={2} style={{ animation: "subtlePulse 1.6s ease-in-out infinite" }} />; })}
          {atk.filter(inView).map(k => { const [r, c] = rc(k); return <rect key={`a${k}`} x={x(c) + 1} y={y(r) + 1} width={size - 2} height={size - 2} fill="none" stroke={ATK} strokeWidth={2.5} rx={2} />; })}
          {arrows.map(([from, to, color = T.silverBright], i) => {
            const [fr, fc] = rc(from), [tr, tc] = rc(to);
            const x1 = x(fc) + size / 2, y1 = y(fr) + size / 2, x2 = x(tc) + size / 2, y2 = y(tr) + size / 2;
            const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, cut = size * 0.3;
            const ex = x2 - ux * cut, ey = y2 - uy * cut;
            return (
              <g key={`w${i}`}>
                <line x1={x1 + ux * cut} y1={y1 + uy * cut} x2={ex - ux * 6} y2={ey - uy * 6} stroke="#000" strokeWidth={6} strokeLinecap="round" opacity={0.6} />
                <line x1={x1 + ux * cut} y1={y1 + uy * cut} x2={ex - ux * 6} y2={ey - uy * 6} stroke={color} strokeWidth={3} strokeLinecap="round" />
                <polygon points={`${ex},${ey} ${ex - ux * 11 - uy * 6},${ey - uy * 11 + ux * 6} ${ex - ux * 11 + uy * 6},${ey - uy * 11 - ux * 6}`} fill={color} stroke="#000" strokeWidth={1} />
              </g>);
          })}
        </svg>
        {Object.entries(marks).filter(([k]) => inView(k)).map(([k, m]) => {
          const [r, c] = rc(k), label = m.label ?? m, color = m.color ?? T.silverBright;
          return <div key={`m${k}`} style={{
            position: "absolute", left: x(c), top: y(r) + size * 0.3, width: size, textAlign: "center", pointerEvents: "none",
          }}><span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 900, letterSpacing: 1, color, background: "#000d", border: `1px solid ${color}`, borderRadius: 2, padding: "1px 5px", whiteSpace: "nowrap" }}>{label}</span></div>;
        })}
      </div>
      {labels && <div style={{ display: "flex", flexDirection: "column", gap, padding: `${pad}px 0` }}>
        {Array.from({ length: rows }).map((_, i) => <div key={i} style={{ height: size, display: "flex", alignItems: "center", fontFamily: FONT_UI, fontSize: 11, letterSpacing: 1.5, color: T.silver, maxWidth: 150 }}>{labels[r0 + i] || ""}</div>)}
      </div>}
    </div>
  );
}

function Loose({ cd, sz = 84, label, fDown, owner, sel, art }) {
  const pick = useContext(ArtCtx);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, paddingTop: sel ? 10 : 0 }}>
      <Card card={{ ...cd, image: pick(cd, art) }} sz={sz} noRar fDown={fDown} owner={owner} viewerRole="player" sel={sel} />
      {label && <div style={{ fontFamily: FONT_UI, fontSize: 10, letterSpacing: 1.5, color: T.silver, textAlign: "center", maxWidth: sz + 30 }}>{label}</div>}
    </div>
  );
}

function Meter({ from, to, max, w = 250 }) {
  const col = v => v > 0 ? T.bless : v < 0 ? T.curse : T.silver;
  const fmt = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
  const segs = []; for (let v = -max; v <= max; v++) segs.push(v);
  return (
    <div style={{ width: w, flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "baseline", marginBottom: 3 }}>
        {from != null && from !== to && <><span style={{ fontFamily: FONT_TITLE, fontSize: 17, color: T.textDim }}>{fmt(from)}</span><span style={{ color: T.textDim }}>→</span></>}
        <span style={{ fontFamily: FONT_TITLE, fontSize: 26, color: col(to), lineHeight: 1 }}>{fmt(to)}</span>
        <span style={{ fontFamily: FONT_UI, fontSize: 10, color: T.textDim, letterSpacing: 2 }}>C</span>
      </div>
      <div style={{ display: "flex", gap: 1, alignItems: "center" }}>
        {segs.map(v => {
          const on = to > 0 ? v > 0 && v <= to : to < 0 ? v < 0 && v >= to : false;
          return <div key={v} style={{ flex: 1, height: v === 0 ? 14 : 8, borderRadius: 1, background: v === 0 ? T.silver : on ? col(to) : "#1e1e2a", boxShadow: v === from && from !== to ? `0 0 0 1px ${T.silverBright}` : "none" }} />;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_UI, fontSize: 9, letterSpacing: 1, marginTop: 3 }}>
        <span style={{ color: T.curse }}>−{max} Oblivion</span><span style={{ color: T.silver }}>Nexus</span><span style={{ color: T.bless }}>Enlightenment +{max}</span>
      </div>
    </div>
  );
}

function Fig({ title, caption, children }) {
  return (
    <figure style={{ margin: "16px 0 20px", padding: "12px 14px 12px", background: T.bg2, border: `1px solid ${T.panelBorder}`, borderRadius: 4 }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 11, letterSpacing: 2.5, color: T.silver, fontWeight: 800, textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "center" }}>{children}</div>
      {caption && <figcaption style={{ fontSize: 14, lineHeight: 1.5, color: T.text, fontStyle: "italic", maxWidth: 760, margin: "10px auto 0", textAlign: "center" }}>{caption}</figcaption>}
    </figure>
  );
}
const Shot = ({ label, children }) => (
  <div>
    <div style={{ fontFamily: FONT_UI, fontSize: 10, letterSpacing: 2, color: T.textDim, fontWeight: 800, textTransform: "uppercase", marginBottom: 5, textAlign: "center" }}>{label}</div>
    {children}
  </div>
);
const Then = () => <div style={{ fontSize: 26, color: T.silverDim, padding: "0 2px" }}>→</div>;

// ─── Text pieces ────────────────────────────────────────────────────────────

const P = ({ children }) => <p style={{ margin: "0 0 10px", fontSize: 16, lineHeight: 1.55, color: T.text, maxWidth: 760 }}>{children}</p>;
const Sub = ({ children }) => <h3 style={{ margin: "22px 0 8px", fontFamily: FONT_UI, fontSize: 15, letterSpacing: 2, color: T.silverBright, fontWeight: 800, textTransform: "uppercase" }}>{children}</h3>;
const Em = ({ children }) => <strong style={{ color: T.textBright, fontWeight: 600 }}>{children}</strong>;
const Rule = ({ children, color = T.silver }) => (
  <div style={{ margin: "10px 0 14px", padding: "8px 14px", borderLeft: `3px solid ${color}`, background: `${color}0d`, fontSize: 16, lineHeight: 1.5, color: T.textBright, maxWidth: 740 }}>{children}</div>
);
const Opt = ({ on }) => (
  <span style={{ marginLeft: 8, verticalAlign: "middle", fontFamily: FONT_UI, fontSize: 9, letterSpacing: 1.5, fontWeight: 800, padding: "2px 7px", borderRadius: 2, border: `1px solid ${on ? T.balanced : T.textDim}`, color: on ? "#70b0b0" : T.textDim }}>
    OPTIONAL · {on ? "ON" : "OFF"} IN YOUR SETTINGS
  </span>
);
const K = ({ children }) => <kbd style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 800, color: T.silverBright, background: T.panel, border: `1px solid ${T.silverDim}`, borderBottomWidth: 2, borderRadius: 3, padding: "1px 7px" }}>{children}</kbd>;
function Tbl({ head, rows, widths }) {
  const cell = { padding: "6px 10px", borderBottom: `1px solid ${T.panelBorder}`, fontSize: 15, lineHeight: 1.4, verticalAlign: "top", textAlign: "left" };
  return (
    <div style={{ overflowX: "auto", margin: "8px 0 16px" }}>
      <table style={{ borderCollapse: "collapse", maxWidth: 800, width: "100%" }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ ...cell, width: widths?.[i], fontFamily: FONT_UI, fontSize: 10, letterSpacing: 2, color: T.textDim, textTransform: "uppercase", borderBottom: `1px solid ${T.silverDim}` }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} style={{ ...cell, color: j === 0 ? T.textBright : T.text }}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const Free = () => <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "#70b0b0" }}>FREE</span>;
const Cost = () => <span style={{ display: "inline-block", width: 9, height: 9, transform: "rotate(45deg)", background: T.silverBright, margin: "0 4px 1px 2px" }} />;

const SECTIONS = [
  ["goal", "The goal"], ["cards", "The cards"], ["board", "The board"], ["turn", "Your turn"],
  ["summon", "Summoning"], ["move", "Moving"], ["combat", "Combat"], ["fields", "Fields"],
  ["equips", "Equips"], ["spells", "Spells & traps"], ["facedown", "Face-down cards"], ["zero", "Zero aura"],
  ["events", "Awakening & Presence"], ["pit", "The Pit"], ["decks", "Decks & sides"], ["controls", "Controls"], ["quick", "Quick reference"],
];

function Sec({ id, children }) {
  const i = SECTIONS.findIndex(s => s[0] === id);
  return (
    <section id={`rules-${id}`} style={{ padding: "26px 0 10px", borderTop: i ? `1px solid ${T.panelBorder}` : "none", scrollMarginTop: 8 }}>
      <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12, fontWeight: 400 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 12, color: T.textDim, letterSpacing: 2, fontWeight: 800 }}>{String(i + 1).padStart(2, "0")}</span>
        <span style={{ fontFamily: FONT_TITLE, fontSize: 34, color: T.white, lineHeight: 1 }}>{SECTIONS[i][1]}</span>
      </h2>
      {children}
    </section>
  );
}

// ─── The page ───────────────────────────────────────────────────────────────

function RulesTab({ settings, cardPool, freePool }) {
  const {
    cMax, actionsPerTurn: APT, handSize, deckSize, maxCopies, spellBudget,
    tributeSummonEnabled: TRIB, beingSetEnabled: BSET, presenceEnabled: PRES, kingOfTheHillEnabled: KOTH,
    combatCap, turnCap, attacksPerBeing, edgeWrap, tokensStart, tokensPerWin, packCost, cardsPerPack,
  } = settings;

  // Art for the example cards comes from the real pool: a pinned card id if the figure names one,
  // otherwise matched by type and alignment
  const pick = useMemo(() => {
    const buckets = {}, byId = {};
    for (const c of cardPool) {
      if (!c.image) continue;
      byId[c.id] = c.image;
      const b = buckets[artKind(c)] ||= [];
      if (b.length < 60) b.push(c.image);
    }
    return (cd, art) => { const b = buckets[artKind(cd)]; return byId[art] || (b?.length ? b[artIdx(cd) % b.length] : undefined); };
  }, [cardPool]);

  // Legal destinations straight from the rulebook
  const cfg = rulesCfg({ C_MAX: cMax, HAND_SIZE: handSize, actionsPerTurn: APT, BEING_SET_ENABLED: true, TRIBUTE_SUMMON_ENABLED: false, PRESENCE_ENABLED: true, KOTH_ENABLED: false, rng: Math.random });
  const acts = (cells, hand = [], act = 3, variant) => legalActions({
    bd: mkBd(cells), pH: hand, aH: [], pD: [], aD: [], pit: { player: [], ai: [] },
    c: 0, cMoved: false, turn: "player", act, tn: 5, ph: "playing", win: null, pRole: "light", flips: 0,
  }, variant ? rulesCfg({ ...cfg, variant }) : cfg);
  const dest = (list, types, from) => [...new Set(list
    .filter(a => types.includes(a.type) && (!from || `${a.fromRow},${a.fromCol}` === from))
    .map(a => `${a.row ?? a.toRow},${a.col ?? a.toCol}`))];

  const hero = being(3, 0, 1).cd;
  const trans = being(2, -1, -1).cd, voidB = being(0, 0, 0).cd;

  const boardPos = {
    "0,1": being(-2, -1, -3, "ai"), "1,3": being(-3, 0, -1, "ai"), "1,0": down(spell("curse", 2, "ai")),
    "3,2": being(3, 0, 1), "4,3": being(1, 2, 2), "3,0": field(0, 1, 0), "2,4": down(spell("bless", 1)),
  };
  const sumStd = { "3,1": being(2, 1, 0), "4,4": being(1, 1, 1), "1,2": being(-2, -2, 0, "ai") };
  const sumOverlap = { "1,1": field(1, 0, 0), "1,3": field(0, 0, 1), "3,1": being(2, 1, 0), "0,4": being(-2, -2, 0, "ai") };
  const sumBeacon = { "1,1": being(0, 0, 0), "3,3": being(2, 1, 0), "0,3": being(-1, -3, 0, "ai") };
  const sumPurge = { "2,2": field(0, -2, 0, "ai"), "2,0": down(spell("curse", 3, "ai")), "3,3": being(2, 1, 0), "1,2": being(-2, -1, -1, "ai"), "0,3": down(equip(0, -1, 0, "ai")) };
  const sumPurgeAfter = { ...sumPurge, "2,2": being(2, -1, -1) };
  const tribBefore = { "3,1": being(1, 1, 0), "3,3": being(2, 0, 2), "1,2": being(-3, -2, 0, "ai") };
  const tribAfter = { "2,2": being(4, 2, 1), "3,3": being(2, 0, 2), "1,2": being(-3, -2, 0, "ai") };
  const setPos = { "3,1": being(2, 1, 0), "1,3": being(-2, -2, 0, "ai"), "4,3": field(0, 1, 0), "2,0": down(spell("bless", 2)) };

  const mvNormal = { "3,2": being(2, 1, 0), "3,3": being(1, 1, 1), "1,1": being(-2, 0, -2, "ai") };
  const mvTrans = { "2,2": being(2, -1, -1), "2,3": being(1, 1, 1), "0,1": being(-2, 0, -2, "ai") };
  const atkPos = t => ({ "3,2": t ? being(2, -1, -1) : being(3, 0, 1), "2,2": being(-1, -2, -1, "ai"), "2,3": being(-2, -1, 0, "ai"), "4,1": being(1, 1, 1) });

  // Edge attacks: a zero-aura being in the corner, enemies on the far sides of the board
  const WRAP = edgeWrap === "full" || edgeWrap === "straight";
  const wrapPos = {
    "4,0": being(2, -1, -1), "3,1": being(-1, -2, -1, "ai"), "0,0": being(-2, -1, 0, "ai"), "4,4": being(-1, 0, -2, "ai"),
    "0,4": being(-3, 0, -1, "ai"), "0,1": being(-2, -2, 0, "ai"), "3,4": being(0, -1, -2, "ai"), "2,2": being(-1, -1, -1, "ai"),
  };
  const wrapAtk = mode => dest(acts(wrapPos, [], 3, { wrapAttack: mode }), ["ATTACK"], "4,0");
  const wrapMarks = mode => Object.fromEntries(wrapAtk(mode).filter(k => k !== "3,1").map(k => [k, { label: "↻ ACROSS", color: ATK }]));

  const fieldPos = { "2,2": field(2, 0, 0), "3,1": being(1, 2, 0), "1,2": being(-3, 0, -1, "ai"), "0,0": being(-3, -1, 0, "ai"), "4,4": being(1, 0, 2) };
  const trapWalk = { "3,2": being(2, 1, 1), "2,2": down(field(0, -2, 0, "ai")) };
  const trapWalkAfter = { "2,2": field(0, -2, 0, "ai") };
  const setBattle = { "3,2": being(3, 0, 1), "2,2": down(being(-1, -3, 0, "ai")) };
  const presPos = {
    "2,2": being(2, 1, 0), "3,1": being(1, 1, 1), "4,4": being(1, 0, 2), "3,3": down(being(2, 2, 0)),
    "1,2": being(-2, -1, -1, "ai"), "0,0": being(-3, -1, 0, "ai"),
  };

  const go = id => document.getElementById(`rules-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const pm = `±${cMax}`;

  return (
    <ArtCtx.Provider value={pick}>
      <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", gap: 26, animation: "fadeIn .3s", fontFamily: FONT_BODY, paddingBottom: 60 }}>
        <nav style={{ position: "sticky", top: 0, alignSelf: "start", paddingTop: 22, display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 9, letterSpacing: 3, color: T.textDim, fontWeight: 800, marginBottom: 6 }}>RULEBOOK</div>
          {SECTIONS.map(([id, label], i) => (
            <button key={id} onClick={() => go(id)} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "3px 0", color: T.silver, fontFamily: FONT_UI, fontSize: 12, letterSpacing: 1, display: "flex", alignItems: "baseline" }}>
              <span style={{ color: T.textDim, marginRight: 7, fontSize: 9, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>{label}
            </button>))}
        </nav>

        <div style={{ minWidth: 0 }}>
          {/* ═══ 1 GOAL ═══ */}
          <Sec id="goal">
            <P>Trinity is a duel on a 5×5 board. There are no life points. Both players pull on one shared number, <Em>Consciousness (C)</Em>, which starts at 0 and runs from −{cMax} to +{cMax}.</P>
            <Fig title="The Consciousness meter" caption={`One player is Light and wins the moment C reaches +${cMax} (Enlightenment). The other is Dark and wins the moment C reaches −${cMax} (Oblivion). Zero is called the Nexus.`}>
              <Meter to={0} max={cMax} w={420} />
            </Fig>
            <P>Every game is Light against Dark. You do not choose a side: your deck decides it (see <Em>Decks &amp; sides</Em>). C moves in two different ways, and the difference matters all game long.</P>
            <Tbl head={["What happened", "Which way C moves"]} widths={["46%"]} rows={[
              ["A being wins a fight", "Toward the winner’s goal, by the margin of the win"],
              ["Presence (more beings on the board)", "1 toward the goal of the player with more beings"],
              ["A Bless is played or flipped", <span key="b">Always <Em>up</Em>, whoever plays it</span>],
              ["A Curse is played or flipped", <span key="c">Always <Em>down</Em>, whoever plays it</span>],
            ]} />
            <Rule>Fights and Presence reward whoever earned them. Spells have a fixed direction: Bless is Light’s ammunition, Curse is Dark’s. A Bless in a Dark deck pushes C the wrong way.</Rule>
            {turnCap > 0 && <Rule>House rule in your settings: in one turn C can move at most <Em>{turnCap}</Em> from where it stood when the turn began, in either direction. Anything beyond that is lost, so a game can only be won in a turn that starts within {turnCap} of the goal. The meter shows how far C can still go this turn.</Rule>}
            <P>In every picture below you sit at the bottom of the board and play <Em>Light</Em>, so you want C to go up. Your cards carry a silver dot, the opponent’s a red one. Cells with a bright outline are where the selected card may go.</P>
          </Sec>

          {/* ═══ 2 CARDS ═══ */}
          <Sec id="cards">
            <P>There are five card types. Beings fight. Fields and Equips change beings’ stats. Bless and Curse move C directly.</P>
            <Fig title="The five card types">
              <Loose cd={hero} sz={104} label="Being — your fighters" />
              <Loose cd={field(2, 0, 0).cd} sz={104} label="Field — changes stats around it" />
              <Loose cd={equip(0, 0, 2).cd} sz={104} label="Equip — permanent boost for one being" />
              <Loose cd={spell("bless", 3).cd} sz={104} label="Bless — C goes up" />
              <Loose cd={spell("curse", 2).cd} sz={104} label="Curse — C goes down" />
            </Fig>
            <Sub>Reading a being</Sub>
            <P>A being has three stats: <Em>Soul (S)</Em>, <Em>Mind (M)</Em> and <Em>Will (W)</Em>, each from −4 to +4. In a fight only the <Em>size</Em> of a stat counts: S−3 hits exactly as hard as S+3. The sign only decides the being’s alignment.</P>
            <P>Add the three stats together to get the being’s <Em>aura</Em>. The symbol in the top-left corner of the art shows it.</P>
            <Fig title="Aura" caption="A stat that glows on the board has been changed by a field or an equip. The symbol always reflects the stats as they are right now.">
              <Loose cd={hero} sz={96} label="△ Light — aura above 0 (3+0+1 = +4)" />
              <Loose cd={being(-2, -1, -3).cd} sz={96} label="▽ Dark — aura below 0 (−6)" />
              <Loose cd={trans} sz={96} label="✡ Transcendent — aura exactly 0 (2−1−1)" />
              <Loose cd={voidB} sz={96} label="✡ Void — all three stats are 0" />
            </Fig>
            <P>Beings with an aura of exactly 0 have extra abilities, covered in <Em>Zero aura</Em>.</P>
            <Sub>Face-down cards</Sub>
            <Fig title="A card set face-down" caption="Any card can be placed face-down (“set”). You always see what your own set cards are. The opponent’s just say SET until they are revealed.">
              <Loose cd={spell("bless", 3).cd} sz={96} fDown owner="player" label="Yours — the strip still tells you what it is" />
              <Loose cd={spell("curse", 3).cd} sz={96} fDown owner="ai" label="The opponent’s — unknown" />
            </Fig>
          </Sec>

          {/* ═══ 3 BOARD ═══ */}
          <Sec id="board">
            <P>The board is 5 by 5. Each cell holds at most one card. Your two home rows are always at the bottom of your screen; in a two-player duel each player sees the board from their own side.</P>
            <Fig title="The board" caption="A thin frame around a face-up field shows the nine cells it influences. Click any card during a game to inspect it.">
              <Board cells={boardPos} labels={{ 0: "Opponent’s home rows", 1: "They summon here", 2: "The middle row", 3: "Your home rows", 4: "You summon here" }} />
            </Fig>
            <P>Two meanings of “next to” are used in the rules, and they are not the same:</P>
            <Tbl head={["Term", "Cells", "Used for"]} rows={[
              [<Em key="a">Adjacent</Em>, "The 4 cells directly up, down, left and right", "Moving, attacking, where face-down cards may be placed"],
              [<Em key="b">Surrounding</Em>, "All 8 cells around, diagonals included", "Field influence, zero-aura attacks, beacons"],
            ]} />
          </Sec>

          {/* ═══ 4 TURN ═══ */}
          <Sec id="turn">
            <P>Who goes first is random. Each player starts with <Em>{handSize} cards</Em>. From the second turn of the game on, the player whose turn begins draws 1 card automatically. There is no hand limit.</P>
            <P>On your turn you have <Em>{APT} actions</Em>, shown as diamonds in the side panel, to spend in any order:</P>
            <div style={{ display: "flex", gap: 9, margin: "4px 0 14px 6px" }}>
              {Array.from({ length: APT }).map((_, i) => <div key={i} style={{ width: 18, height: 18, transform: "rotate(45deg)", background: i < APT - 1 ? T.silverBright : T.panelBorder, border: `1.5px solid ${i < APT - 1 ? T.white : T.silverDim}` }} />)}
              <span style={{ marginLeft: 8, fontSize: 14, color: T.textDim, fontStyle: "italic" }}>{APT - 1} of {APT} actions left</span>
            </div>
            <Tbl head={["Costs 1 action", ""]} widths={["34%"]} rows={[
              [<span key="1"><Cost />Draw</span>, "Take the top card of your deck."],
              [<span key="2"><Cost />Summon a being</span>, "Put a being from your hand onto the board, face-up."],
              [<span key="3"><Cost />Move a being</span>, "One step up, down, left or right."],
              [<span key="4"><Cost />Attack</span>, "Fight an enemy being next to yours. You pick the stat."],
              [<span key="5"><Cost />Play a Bless or Curse</span>, <span key="5b">Move C by the spell’s power. <Em>Free while C is exactly 0</Em> (once C has moved at least once this game).</span>],
              [<span key="6"><Cost />Play a field face-up</span>, "It starts working immediately."],
              [<span key="7"><Cost />Equip a being</span>, "Add an equip’s stats to one of your beings."],
            ]} />
            <Tbl head={["Costs nothing", ""]} widths={["34%"]} rows={[
              [<span key="1"><Free /> Set a Bless or Curse</span>, "Place it face-down as a trap."],
              [<span key="2"><Free /> Set a field</span>, "Place it face-down."],
              [<span key="3"><Free /> Set an equip</span>, "Only while you have exactly 1 action left."],
              ...(BSET ? [[<span key="4"><Free /> Set a being</span>, "Place it face-down in your half of the board."]] : []),
              [<span key="5"><Free /> Flip your own set card</span>, "At most 2 flips per turn, and the card must be primed."],
            ]} />
            <Rule>Your turn ends by itself a moment after you spend your last action. Do the free things first, or press End Turn early if you want to stop.</Rule>
            <P>When a turn ends, {PRES ? "Presence is checked, " : ""}the other player draws a card, and the face-down cards they set earlier become primed.</P>
          </Sec>

          {/* ═══ 5 SUMMON ═══ */}
          <Sec id="summon">
            <P>Summoning costs 1 action. Select a being in your hand and the cells it may enter light up. A being can move and attack on the turn it arrives.</P>
            <Fig title="The normal summon" caption="Any empty cell in your two home rows.">
              <Loose cd={being(1, 2, 1).cd} label="Selected in hand" sel />
              <Board cells={sumStd} hl={dest(acts(sumStd, [being(1, 2, 1).cd]), ["SUMMON"])} />
            </Fig>
            <Sub>Summoning beyond your home rows</Sub>
            <P>Three things open up more cells.</P>
            <Fig title="Field overlap" caption="An empty cell surrounded by two or more face-up fields (anyone’s) is open to both players. Here the three cells between the two fields are added to your home rows.">
              <Board cells={sumOverlap} hl={dest(acts(sumOverlap, [being(1, 2, 1).cd]), ["SUMMON"])} />
            </Fig>
            <Fig title="Void beings and beacons" caption="A Void being (0/0/0) can be summoned to any empty cell on the board. Once it is there it is a beacon: your other beings can be summoned to any empty cell surrounding it.">
              <Loose cd={being(1, 2, 1).cd} label="Selected in hand" sel />
              <Board cells={sumBeacon} hl={dest(acts(sumBeacon, [being(1, 2, 1).cd]), ["SUMMON"])} marks={{ "1,1": "BEACON" }} />
            </Fig>
            <Fig title="Purge" caption="A being whose own stats add up to 0 can be summoned on top of any field (face-up or face-down, yours or theirs) and on top of any face-down card. The card underneath is destroyed. This is the cleanest way to remove an enemy field or an unknown trap.">
              <Loose cd={trans} label="✡ in hand" sel />
              <Shot label="Before"><Board cells={sumPurge} hl={dest(acts(sumPurge, [trans]), ["SUMMON"])} view={[0, 4, 0, 3]} /></Shot>
              <Then />
              <Shot label="After purging the field"><Board cells={sumPurgeAfter} view={[0, 4, 0, 3]} /></Shot>
            </Fig>
            <Sub>Tribute summon <Opt on={TRIB} /></Sub>
            <P>With this rule on, a being whose aura is above +5 or below −5 is too powerful to summon normally. To play it you must sacrifice one of your own face-up beings. In return the new being may land on <Em>any empty cell on the board</Em>, or on the cell the sacrifice just left. It still costs 1 action, and tribute-level beings cannot be set face-down.</P>
            <Fig title="Tribute summon">
              <Loose cd={being(4, 2, 1).cd} label="Aura +7 — needs a tribute" sel />
              <Shot label="Pick the sacrifice"><Board cells={tribBefore} hl={["3,1", "3,3"]} marks={{ "3,1": "SACRIFICE" }} view={[0, 4, 0, 3]} /></Shot>
              <Then />
              <Shot label="Place it anywhere"><Board cells={tribAfter} view={[0, 4, 0, 3]} /></Shot>
            </Fig>
            <Sub>Setting a being face-down <Opt on={BSET} /></Sub>
            <P>Instead of summoning, you may set a being face-down for free. It can go in your home rows or the middle row (plus overlap and beacon cells), but only on a cell with <Em>no card adjacent to it</Em>. A set being cannot move or attack and does not count for Presence. Like every set card it must prime first: from your next turn on you can flip it face-up for free. What happens when the enemy walks into it is covered in <Em>Face-down cards</Em>.</P>
            <Fig title="Where a being can be set" caption="Home rows and the middle row, minus every cell that touches another card.">
              <Board cells={setPos} hl={dest(acts(setPos, [being(1, 2, 1).cd]), ["SET_BEING"])} />
            </Fig>
          </Sec>

          {/* ═══ 6 MOVE ═══ */}
          <Sec id="move">
            <P>Moving costs 1 action. Click one of your face-up beings, then a lit cell. The same being may move several times in a turn if you have the actions.</P>
            <Fig title="A normal move" caption="One step up, down, left or right. Face-up beings block the way, yours and theirs.">
              <Board cells={mvNormal} hl={dest(acts(mvNormal), ["MOVE"], "3,2")} arrows={dest(acts(mvNormal), ["MOVE"], "3,2").map(k => ["3,2", k])} view={[1, 4, 0, 4]} />
            </Fig>
            <Fig title="A zero-aura move" caption="A being whose current aura is exactly 0 can reach any cell within two steps, including one step diagonally. A straight two-step move is blocked when a face-up card stands in between; face-down cards do not block.">
              <Board cells={mvTrans} hl={dest(acts(mvTrans), ["MOVE"], "2,2")} marks={{ "2,4": { label: "BLOCKED", color: T.textDim } }} />
            </Fig>
            <Sub>What you can step onto</Sub>
            <Tbl head={["On the cell", "What happens"]} widths={["40%"]} rows={[
              ["Nothing", "You move there."],
              ["Any face-up being", "You cannot enter. Attack it instead if it is an enemy."],
              ["An enemy face-up field", "You cannot enter, unless your being is zero-aura: then it moves in and the field is destroyed (see Zero aura)."],
              ["Your own face-up field", "You move in and the field is discarded. Useful to clear your own path."],
              ["An enemy face-down card", "You walk into whatever it is. See Face-down cards."],
              ["Your own set equip", "If it is primed, your being picks it up. If not, you cannot enter yet."],
              ["Your own set being", "You cannot enter."],
              ["Your own set spell or set field", "You move in and the card is discarded unused. Avoid this."],
            ]} />
          </Sec>

          {/* ═══ 7 COMBAT ═══ */}
          <Sec id="combat">
            <P>Attacking costs 1 action. Click your being, click an enemy being next to it, then choose <Em>Soul, Mind or Will</Em>. Both beings compare that one stat, ignoring the sign.</P>
            <Rule color={ATK}>The attacker chooses the stat. That choice is the whole fight, so attack where you are strong and they are weak, and do not leave your weak stat where they can reach it.</Rule>
            <Tbl head={["Result", "What happens"]} widths={["30%"]} rows={[
              ["Your stat is higher", "The defender is destroyed. C moves toward your goal by the difference."],
              ["Your stat is lower", "Your attacker is destroyed. C moves toward the opponent’s goal by the difference."],
              ["Equal", "Both beings are destroyed. C does not move."],
            ]} />
            <Fig title="One attack, three possible choices" caption="Same two beings, three very different results. Check all three stats before you click.">
              <Shot label="The position">
                <Board cells={{ "3,2": being(3, 0, 1), "2,2": being(-1, -2, -1, "ai") }} atk={["2,2"]} arrows={[["3,2", "2,2", ATK]]} view={[2, 3, 1, 3]} />
              </Shot>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  ["Soul", "|3| against |1|", "You win by 2", { "3,2": being(3, 0, 1), "2,2": being(-1, -2, -1, "ai") }, ["2,2"], 2],
                  ["Mind", "|0| against |2|", "You lose by 2", { "3,2": being(3, 0, 1), "2,2": being(-1, -2, -1, "ai") }, ["3,2"], -2],
                  ["Will", "|1| against |1|", "Tie — both destroyed", { "3,2": being(3, 0, 1), "2,2": being(-1, -2, -1, "ai") }, ["3,2", "2,2"], 0],
                ].map(([stat, cmp, res, cells, dead, c]) => (
                  <div key={stat} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 150 }}>
                      <div style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 900, letterSpacing: 2, color: STAT_DEFS.find(s => s.label === stat[0]).color }}>ATTACK WITH {stat.toUpperCase()}</div>
                      <div style={{ fontSize: 15, color: T.text }}>{cmp}</div>
                      <div style={{ fontSize: 15, color: T.textBright, fontWeight: 600 }}>{res}</div>
                    </div>
                    <Board cells={cells} dim={dead} marks={Object.fromEntries(dead.map(k => [k, { label: "✕", color: ATK }]))} view={[2, 3, 2, 2]} />
                    <Meter from={0} to={c} max={cMax} w={210} />
                  </div>))}
              </div>
            </Fig>
            <Sub>Who can attack whom</Sub>
            <P>The target must be a <Em>face-up enemy being</Em> adjacent to your attacker. A being whose current aura is 0 can also attack diagonally. Winning a normal attack does not move your being; it stays where it was.{attacksPerBeing > 0 ? ` Each being may attack ${attacksPerBeing} time${attacksPerBeing > 1 ? "s" : ""} per turn.` : " A being may attack as many times as you have actions."}</P>
            <Fig title="Attack reach" caption="The same position with a normal being and with a zero-aura being. Only the zero-aura being reaches the diagonal.">
              <Shot label="Normal being"><Board cells={atkPos(false)} atk={dest(acts(atkPos(false)), ["ATTACK"], "3,2")} view={[1, 4, 1, 4]} /></Shot>
              <Shot label="✡ Zero-aura being"><Board cells={atkPos(true)} atk={dest(acts(atkPos(true)), ["ATTACK"], "3,2")} view={[1, 4, 1, 4]} /></Shot>
            </Fig>
            <Sub>Edge attacks <Opt on={WRAP} /></Sub>
            <P>For a being whose current aura is 0, the board has no edges when it attacks: a target on the opposite side counts as next to it, as if the board wrapped around. Only attacks carry over an edge; movement does not. A being on the rim is no longer out of reach.{WRAP ? (edgeWrap === "full" ? " The setting is on for all 8 directions." : " The setting is on for straight crossings only.") : ""}</P>
            <Fig title="Attacking across the edge" caption="A zero-aura being in the bottom-left corner. Straight: it reaches the far end of its row, the far end of its column and the opposite corner — 6 cells in all. All 8: every direction wraps, so it also reaches the two cells beside those.">
              <Shot label={`Straight over${edgeWrap === "straight" ? " (current setting)" : ""}`}><Board cells={wrapPos} atk={wrapAtk("straight")} marks={wrapMarks("straight")} /></Shot>
              <Shot label={`All 8 directions${edgeWrap === "full" ? " (current setting)" : ""}`}><Board cells={wrapPos} atk={wrapAtk("full")} marks={wrapMarks("full")} /></Shot>
            </Fig>
            <Sub>Stats in a fight</Sub>
            <P>Fights use each being’s <Em>current</Em> stats: the printed stats, plus every face-up field surrounding it, plus every equip it carries. The numbers on the board are always the current ones.</P>
            {combatCap > 0 && <Rule>House rule in your settings: a single fight moves C by at most {combatCap}, whatever the margin.</Rule>}
          </Sec>

          {/* ═══ 8 FIELDS ═══ */}
          <Sec id="fields">
            <P>A field sits on a cell and adds its stats to <Em>every being in the 8 surrounding cells, friend and foe alike</Em>, for as long as it stays face-up. Nothing can stand on a face-up field.</P>
            <Fig title="A field at work" caption="This field gives S+2. Your being beside it goes from S+1 to S+3. The enemy being is Dark with S−3, so +2 drags it to S−1 and makes it weaker. A field of your own alignment strengthens your beings and weakens theirs. The enemy in the far corner is out of range.">
              <Board cells={fieldPos} marks={{ "3,1": "S+1 → S+3", "1,2": { label: "S−3 → S−1", color: ATK } }} />
            </Fig>
            <P>Fields stack: a being surrounded by two fields gets both. Because a field can change a being’s aura, it can also turn a being zero-aura, or stop it being zero-aura.</P>
            <Sub>Placing a field</Sub>
            <Tbl head={["How", "Cost", "Where"]} rows={[
              ["Face-up", <span key="a"><Cost />1 action</span>, "An empty cell with no field and no face-down card in any of its 8 surrounding cells."],
              ["Face-down (set)", <Free key="b" />, "An empty cell with no card adjacent to it. It does nothing until it is flipped."],
            ]} />
            <Fig title="Where each kind of placement is allowed" caption="Same position, two different rules. Face-up fields need distance from other fields and from face-down cards. Face-down cards of every type need an empty cross around them.">
              <Shot label="A face-up field"><Board cells={setPos} hl={dest(acts(setPos, [field(1, 0, 0).cd]), ["PLAY_FIELD"])} /></Shot>
              <Shot label="Any face-down card"><Board cells={setPos} hl={dest(acts(setPos, [field(1, 0, 0).cd]), ["TERRAIN"])} /></Shot>
            </Fig>
            <Sub>A set field is a trap</Sub>
            <Fig title="Walking onto an enemy’s set field" caption="The being that steps on it is destroyed and the field flips face-up where it lies. No C changes hands, but you lose the being.">
              <Shot label="You move onto the unknown card"><Board cells={trapWalk} arrows={[["3,2", "2,2"]]} view={[1, 3, 1, 3]} /></Shot>
              <Then />
              <Shot label="It was a field"><Board cells={trapWalkAfter} view={[1, 3, 1, 3]} /></Shot>
            </Fig>
            <Sub>Getting rid of a field</Sub>
            <Tbl head={["Method", "Works on"]} widths={["52%"]} rows={[
              ["Purge: summon a ✡ being on top of it", "Any field, face-up or face-down"],
              ["Diffuse: walk onto it with a zero-aura being", "Enemy face-up fields"],
              ["Walk onto it with any of your beings", "Your own face-up fields"],
              ["Surround it: 4 or more enemy face-up beings in its 8 surrounding cells", "Face-down fields — it is freed (discarded)"],
            ]} />
          </Sec>

          {/* ═══ 9 EQUIPS ═══ */}
          <Sec id="equips">
            <P>An equip adds its stats to one of your beings permanently. It costs 1 action: select the equip, click the being. The equip card goes to the Pit, the boost stays until the being leaves the board. A being can carry any number of equips.</P>
            <Fig title="Equipping" caption="An equip with W+2 covers this being’s weak stat. Negative equips work the same way and suit Dark beings.">
              <Loose cd={equip(0, 0, 2).cd} label="Equip in hand" sel />
              <Shot label="Before"><Board cells={{ "3,2": being(2, 1, 0) }} hl={["3,2"]} view={[3, 3, 1, 3]} /></Shot>
              <Then />
              <Shot label="After"><Board cells={{ "3,2": being(2, 1, 0, "player", { ib: { soul: 0, mind: 0, will: 2 } }) }} view={[3, 3, 1, 3]} /></Shot>
            </Fig>
            <Sub>Setting an equip</Sub>
            <P>You can also set an equip face-down for free, but only while you have exactly 1 action left, and only on a cell with no card adjacent. From your next turn on, walk one of your beings onto it to pick it up at no extra cost beyond the move. If an enemy being steps on it first, or a ✡ being is summoned on top of it, it is destroyed with no effect.</P>
          </Sec>

          {/* ═══ 10 SPELLS ═══ */}
          <Sec id="spells">
            <P>A Bless raises C by its power. A Curse lowers C by its power. Select the spell and press Play. It costs 1 action and the card goes to the Pit.</P>
            <Fig title="Spells have a fixed direction">
              <Loose cd={spell("bless", 3).cd} label="Bless +3" />
              <Meter from={-1} to={2} max={cMax} w={230} />
              <div style={{ width: 20 }} />
              <Loose cd={spell("curse", 2).cd} label="Curse −2" />
              <Meter from={2} to={0} max={cMax} w={230} />
            </Fig>
            <Tbl head={["Rule", "Detail"]} widths={["30%"]} rows={[
              [<Em key="a">Nexus</Em>, "While C is exactly 0, playing a spell costs no action. This does not apply before C has moved for the first time in the game."],
              [<Em key="b">Power-1 spells</Em>, "A Bless or Curse of power 1 draws you a card when you play it from your hand."],
              [<Em key="c">Budget</Em>, `The powers of all spells in a deck may add up to at most ${spellBudget}.`],
            ]} />
            <Sub>Traps</Sub>
            <P>Instead of playing a spell you can set it face-down for free, on any empty cell with no card adjacent. A set spell must <Em>prime</Em> first: it cannot be flipped on the turn you set it. From your next turn on, click it to flip it for free (2 flips per turn at most). It then takes effect exactly like a played spell, in the same fixed direction.</P>
            <Fig title="A trap, from set to flip" caption="Setting costs nothing, so a trap is a spell you pay for with patience instead of an action.">
              <Shot label="Your turn: set it"><Board cells={{ "2,2": down(spell("bless", 3), 1) }} marks={{ "2,2": { label: "PRIMING", color: T.textDim } }} view={[2, 2, 1, 3]} /></Shot>
              <Then />
              <Shot label="Your next turn: flip it"><Board cells={{ "2,2": down(spell("bless", 3)) }} hl={["2,2"]} view={[2, 2, 1, 3]} /></Shot>
              <Then />
              <Meter from={0} to={3} max={cMax} w={210} />
            </Fig>
            <Fig title="Defusing a trap" caption="If an enemy being walks onto a set spell before its owner flips it, the spell is discarded and nothing happens. Stepping on the opponent’s face-down cards is how you disarm them, at the risk that it is a field or a being instead.">
              <Shot label="The enemy moves in"><Board cells={{ "2,2": down(spell("bless", 3)), "1,2": being(-2, -1, -1, "ai") }} arrows={[["1,2", "2,2", ATK]]} view={[1, 2, 1, 3]} /></Shot>
              <Then />
              <Shot label="Trap defused"><Board cells={{ "2,2": being(-2, -1, -1, "ai") }} view={[1, 2, 1, 3]} /></Shot>
            </Fig>
          </Sec>

          {/* ═══ 11 FACE-DOWN ═══ */}
          <Sec id="facedown">
            <P>All face-down cards in one place. Every one of them is free to set and must go on an empty cell with <Em>no card adjacent</Em>. The opponent sees only that something is there.</P>
            <Tbl head={["Set card", "When its owner flips it", "When an enemy being steps on it"]} widths={["18%", "38%"]} rows={[
              ["Bless / Curse", "Primes for a turn. Then flip for free: it moves C by its power.", "Defused: discarded, no effect."],
              ["Field", "Primes for a turn. Then flip for free: it becomes an active field.", "The being is destroyed and the field flips face-up."],
              ["Equip", "Cannot be flipped. Once primed, one of your beings walks onto it to pick it up.", "Destroyed, no effect."],
              ...(BSET ? [["Being", "Primes for a turn. Then flip for free to reveal it.", "A set battle (below)."]] : []),
            ]} />
            <P>You may flip at most <Em>2 of your set cards per turn</Em>. A ✡ being summoned on top of any face-down card destroys it without triggering anything.</P>
            {BSET && <>
              <Sub>Set battle</Sub>
              <P>Moving onto an enemy’s face-down being is an attack made blind. You choose Soul, Mind or Will <Em>before</Em> the card is revealed. Then it flips, and the fight resolves on its cell using the usual rules. If you win, your being takes the cell. If you lose, your being is destroyed and theirs stays, now face-up. A tie destroys both.</P>
              <Fig title="A set battle" caption="You commit to Soul without knowing what is underneath. This time it pays off: |3| beats |1|, the defender is destroyed, C moves 2 your way and your being advances.">
                <Shot label="Choose a stat, then move in"><Board cells={setBattle} arrows={[["3,2", "2,2", ATK]]} view={[2, 3, 1, 3]} /></Shot>
                <Then />
                <Shot label="Revealed and beaten"><Board cells={{ "2,2": being(3, 0, 1) }} view={[2, 3, 1, 3]} /></Shot>
                <Meter from={0} to={2} max={cMax} w={210} />
              </Fig>
            </>}
          </Sec>

          {/* ═══ 12 ZERO AURA ═══ */}
          <Sec id="zero">
            <P>A being is <Em>zero-aura</Em> (✡) whenever its current Soul + Mind + Will equals 0. The check uses current stats, so a field or an equip can switch it on or off during the game.</P>
            <Tbl head={["Ability", "Who has it"]} widths={["56%"]} rows={[
              ["Move up to two steps (one diagonal step included)", "Any being whose current aura is 0"],
              ["Attack all 8 surrounding cells", "Any being whose current aura is 0"],
              ["Purge: be summoned on top of a field or face-down card", "Beings whose printed stats add up to 0"],
              ["Diffuse: walk onto an enemy face-up field and destroy it", "Any being whose current aura is 0"],
              ["Be summoned to any empty cell on the board", "Void beings (0/0/0)"],
              ["Beacon: let your other beings be summoned around it", "Void beings (0/0/0), while face-up"],
            ]} />
            <P>A field changes the stats of every being around it, so a zero-aura being standing next to an enemy field usually stops being zero-aura. To diffuse a field, come at it from two cells away in a straight line, with no face-up card in between.</P>
            <Fig title="Becoming zero-aura" caption="This being has aura +1. An equip with W−1 brings it to exactly 0: the symbol changes to ✡ and it now moves two steps and attacks diagonally.">
              <Shot label="Aura +1"><Board cells={{ "3,2": being(2, -1, 0) }} view={[3, 3, 1, 3]} /></Shot>
              <Loose cd={equip(0, 0, -1).cd} sz={62} label="+ equip W−1" />
              <Then />
              <Shot label="Aura 0"><Board cells={{ "3,2": being(2, -1, 0, "player", { ib: { soul: 0, mind: 0, will: -1 } }) }} view={[3, 3, 1, 3]} /></Shot>
            </Fig>
            <P>A Void being loses every fight it does not tie, so it is a utility piece: a beacon, a body for Presence{TRIB ? ", or a tribute" : ""}.</P>
          </Sec>

          {/* ═══ 13 EVENTS ═══ */}
          <Sec id="events">
            <Sub>Awakening and Revenance</Sub>
            <P>When a <Em>spell</Em> (played from hand or flipped as a trap) carries C across zero, or lands it exactly on zero, the player being pushed away from their goal draws up to 2 cards. The log calls it Awakening when you draw and Revenance when the opponent does. Fights and Presence do not trigger it.</P>
            <Fig title="Awakening" caption="You are Light and ahead at +2. The opponent plays a Curse of power 3. C crosses zero, so you draw 2 cards as compensation. Pushing someone through zero with a spell hands them cards.">
              <Loose cd={spell("curse", 3, "ai").cd} label="Opponent’s Curse −3" />
              <Meter from={2} to={-1} max={cMax} w={250} />
              <div style={{ fontFamily: FONT_UI, fontSize: 13, letterSpacing: 2, color: T.silverBright, fontWeight: 800 }}>⟐ YOU DRAW 2</div>
            </Fig>
            <Sub>Presence <Opt on={PRES} /></Sub>
            <P>At the end of every turn after the third turn of the game, both sides count their face-up beings. Beings in the central 3×3 count <Em>double</Em>. If one side leads by 2 or more, C moves 1 toward that side’s goal. Face-down beings count for nothing.</P>
            <Fig title="Counting Presence" caption="You: 2 + 2 + 1 = 5. Opponent: 2 + 1 = 3. You lead by 2, so C moves 1 your way at the end of this turn, and again every turn it stays like this.">
              <Board cells={presPos} boxes={[[1, 1, 3, 3]]} marks={{ "2,2": "×2", "3,1": "×2", "4,4": "×1", "3,3": { label: "×0", color: T.textDim }, "1,2": { label: "×2", color: ATK }, "0,0": { label: "×1", color: ATK } }} />
              <Meter from={3} to={4} max={cMax} w={230} />
            </Fig>
            <Sub>King of the hill <Opt on={KOTH} /></Sub>
            <P>With this rule on, from the third turn of the game the owner of a face-up card on the centre cell gains 1 C at the end of every turn. A field on the centre counts as well as a being.</P>
            {KOTH && <Fig title="Holding the centre">
              <Board cells={{ "2,2": being(2, 1, 1), "1,1": being(-2, 0, -2, "ai") }} boxes={[[2, 2, 2, 2]]} view={[1, 3, 1, 3]} />
              <Meter from={1} to={2} max={cMax} w={230} />
            </Fig>}
          </Sec>

          {/* ═══ 14 PIT ═══ */}
          <Sec id="pit">
            <P>Each player has a Pit, their discard pile. Destroyed beings, used spells and equips, and removed fields and traps go to their <Em>owner’s</Em> Pit.</P>
            <P>You cannot run out of cards. When your deck is empty and you need to draw, your Pit is shuffled and becomes your new deck. Everything you lose comes back eventually, and so does everything you destroy. The only exception: the 2-card Awakening draw takes what is left in the deck and does not reshuffle.</P>
          </Sec>

          {/* ═══ 15 DECKS ═══ */}
          <Sec id="decks">
            <Tbl head={["Deck rule", "Your settings"]} widths={["50%"]} rows={[
              ["Deck size", `${deckSize} cards (fewer is allowed, more is not)`],
              ["Copies of the same card", `At most ${maxCopies}`],
              ["Total power of all Bless and Curse cards", `At most ${spellBudget}`],
            ]} />
            <P>A deck that breaks a rule cannot start a game; the lobby tells you why.</P>
            <Sub>Light or Dark</Sub>
            <P>Add up the deck: every Bless counts as plus its power, every Curse as minus its power, and every being, field and equip counts as its aura. A total below zero makes the deck <Em>Dark</Em>; anything else makes it <Em>Light</Em>. The two decks in a game must be on opposite sides, so the lobby greys out opponents on your side.</P>
            <Rule>Build in one direction. Light decks want positive beings and Bless spells. Dark decks want negative beings and Curses. Mixing cancels your own work.</Rule>
            <Sub>What to put in</Sub>
            <Tbl head={["Type", "Typical count", "Why"]} rows={[
              ["Beings", "15–18", "Fights, board control, Presence"],
              ["Bless or Curse", `Up to the budget of ${spellBudget}`, "Direct C and traps. Power-1 spells replace themselves."],
              ["Fields", "2–3", "Tilt the fights where you plan to have them, open summon cells"],
              ["Equips", "2–4", "Fix a weak stat or build one dominant attacker"],
            ]} />
            <P>Specialists (one big stat, one zero) are strong when attacking and fragile when attacked. Generalists (no zero) are hard to exploit but win by small margins. A few ✡ beings give you reach and field removal.</P>
            {freePool ? <>
              <Sub>Cards</Sub>
              <P>Every card in the Codex is available to your decks.</P>
            </> : <>
            <Sub>Cards and packs</Sub>
            <P>You can only deck cards you own. You start with {tokensStart} token{tokensStart === 1 ? "" : "s"}, earn {tokensPerWin} per win, and a pack costs {packCost} and holds {cardsPerPack} cards.</P>
            </>}
          </Sec>

          {/* ═══ 16 CONTROLS ═══ */}
          <Sec id="controls">
            <Tbl head={["To do this", "Do this"]} widths={["34%"]} rows={[
              ["Summon, play a field, equip", "Click the card in your hand, then a lit cell. Click the card again to cancel."],
              ["Play or set a spell", "Click it in your hand, then Play or Set in the side panel. For Set, then click a lit cell."],
              ["Set a field, equip or being", "Click it in your hand, press Set in the side panel, then click a lit cell."],
              ["Move or attack", "Click your being, then a lit cell. If it holds an enemy being, pick S, M or W."],
              ["Flip your set card", "Click it while nothing else is selected."],
              ["Inspect any card", "Click it while nothing is selected. Current stats show in the side panel."],
            ]} />
            <Tbl head={["Key", "Action"]} widths={["34%"]} rows={[
              [<span key="1"><K>1</K>–<K>9</K></span>, "Select that card in your hand"],
              [<K key="2">D</K>, "Draw a card"],
              [<K key="3">B</K>, "Play the selected Bless or Curse"],
              [<span key="4"><K>S</K> <K>M</K> <K>W</K></span>, "Choose Soul, Mind or Will for an attack"],
              [<K key="5">S</K>, "Set the selected hand card (when not choosing a stat)"],
              [<span key="6"><K>Esc</K> or <K>C</K></span>, "Cancel the selection"],
              [<K key="7">E</K>, "End turn"],
              [<K key="8">P</K>, "Show or hide the Pit"],
              [<K key="9">Q</K>, "Forfeit"],
            ]} />
          </Sec>

          {/* ═══ 17 QUICK ═══ */}
          <Sec id="quick">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "0 28px", maxWidth: 860 }}>
              {[
                ["Win", `Light at +${cMax}, Dark at −${cMax}. One shared meter.`],
                ...(turnCap > 0 ? [["Turn limit", `House rule: C moves at most ${turnCap} in one turn, counted from where the turn began. The excess is lost.`]] : []),
                ["Turn", `${APT} actions. Draw 1 automatically at the start.`],
                ["1 action", "Draw · summon · move · attack · play spell · play field · equip."],
                ["Free", `Set a spell, field${BSET ? ", being" : ""} or equip (equip: only at 1 action left) · flip your set cards (2 per turn).`],
                ["Summon", "Your two home rows. Also: between 2+ fields, around your Void being."],
                ["Fight", "Attacker picks S, M or W. Bigger number wins, sign ignored. C moves by the difference toward the winner. Tie destroys both."],
                ["Spells", "Bless always up, Curse always down. Free at C = 0. Power 1 draws a card."],
                ["Fields", "Change every being in the 8 surrounding cells, both sides."],
                ["Face-down", "No card adjacent when set. Nothing can be flipped the turn it is set."],
                ["Stepping on enemy set cards", `Spell: defused. Equip: destroyed. Field: your being dies.${BSET ? " Being: blind fight." : ""}`],
                ["Zero aura ✡", "Two-step moves, 8-way attacks. Printed-zero beings purge by summoning onto fields and set cards."],
                ["Crossing zero", "By a spell: the player pushed back draws 2."],
                ...(PRES ? [["Presence", "After turn 3: lead by 2+ beings (centre 3×3 counts double) for 1 C per turn."]] : []),
                ...(KOTH ? [["Centre", "From turn 3: a face-up card on the centre cell earns 1 C per turn."]] : []),
                ...(TRIB ? [["Tribute", "Aura beyond ±5: sacrifice a being, then land anywhere."]] : []),
                ["Pit", "Empty deck? The Pit is reshuffled into it."],
                ["Deck", `${deckSize} cards, ${maxCopies} cop${maxCopies === 1 ? "y" : "ies"} each, spell power ≤ ${spellBudget}.`],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: "7px 0", borderBottom: `1px solid ${T.panelBorder}`, fontSize: 15, lineHeight: 1.4 }}>
                  <div style={{ fontFamily: FONT_UI, fontSize: 10, letterSpacing: 2, color: TC.bless, fontWeight: 800, textTransform: "uppercase" }}>{k}</div>
                  <div style={{ color: T.text }}>{v}</div>
                </div>))}
            </div>
            <div style={{ fontSize: 13, color: T.textDim, fontStyle: "italic", marginTop: 14 }}>Numbers on this page follow your current settings ({pm} C, {APT} actions, hand of {handSize}). Change them under ⚙ and this page updates.</div>
          </Sec>
        </div>
      </div>
    </ArtCtx.Provider>
  );
}

export default memo(RulesTab);
