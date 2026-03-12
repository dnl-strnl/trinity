import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  FONT_TITLE, FONT_UI, FONT_BODY, FONT_URL, THEME as T, TYPE_COLORS as TC,
  DEFAULT_GRADS as DG, RARITY_COLORS as RC, RARITY_ORDER as RO,
  STAT_DEFS, STAT_MIN, STAT_MAX, C_MAX, DECK_SIZE, HAND_SIZE, MAX_COPIES,
  TOKENS_START, TOKENS_PER_WIN, PACK_COST,
} from "./theme.js";

const fl = document.createElement("link");
fl.href = FONT_URL; fl.rel = "stylesheet"; document.head.appendChild(fl);

function aura(c) { return STAT_DEFS.reduce((a, s) => a + (c[s.key] || 0), 0); }
function orient(c) { const a = aura(c); return a > 0 ? "light" : a < 0 ? "dark" : "balanced"; }
function oCol(o) { return o === "light" ? T.light : o === "dark" ? T.dark : T.balanced; }
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]]; } return b; }
function gc(id, p) { return p.find(c => c.id === id); }
function getDeckMagnitude(deck, cardPool) {
  if (!deck || !deck.cards) return 0;
  return deck.cards.reduce((sum, id) => {
    const c = gc(id, cardPool);
    if (!c) return sum;
    if (c.type === "blessing") return sum + cPwr(c);
    if (c.type === "curse") return sum - cPwr(c);
    return sum + (c.soul || 0) + (c.mind || 0) + (c.will || 0);
  }, 0);
}

function adj(r, c, d = 1) {
  const o = [];
  for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
    if (!dr && !dc) continue; if (Math.abs(dr) + Math.abs(dc) > d) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) o.push([nr, nc]);
  }
  return o;
}
function hasAdjTerrain(r, c, bd) {
  return adj(r, c).some(([ar, ac]) => bd[ar]?.[ac]?.cd.type === "terrain");
}

function tBonus(bd, r, c) {
  const b = { soul: 0, mind: 0, will: 0 };
  adj(r, c).forEach(([ar, ac]) => {
    const cl = bd[ar]?.[ac];
    if (cl?.cd?.type === "terrain") STAT_DEFS.forEach(s => { b[s.key] += cl.cd[s.key] || 0; });
  }); return b;
}

function getEff(card, bd, r, c, ib) {
  let cd = { ...card }; STAT_DEFS.forEach(s => cd[s.key] = cd[s.key] || 0);
  const tb = tBonus(bd, r, c); const i = ib || { soul: 0, mind: 0, will: 0 };
  const out = {}; STAT_DEFS.forEach(s => { out[s.key] = cd[s.key] + tb[s.key] + (i[s.key] || 0); }); return out;
}

function cPwr(cd) {
  if (cd.power) return cd.power;
  return Math.abs(cd.soul || 0) + Math.abs(cd.mind || 0) + Math.abs(cd.will || 0);
}

function Card({ card, sz, fill, onClick, sel, fDown, dim, owner, sparkle, noRar, notOwned, mask, effStats }) {
  if (!card) return null;
  const w = fill ? "100%" : sz;
  const h = fill ? "100%" : undefined;
  const fs = fill ? 10 : (sz || 80) < 60 ? 5 : (sz || 80) < 100 ? 7 : (sz || 80) < 150 ? 9 : 11;
  const stripH = fill ? 14 : (sz || 80) < 60 ? 8 : (sz || 80) < 100 ? 10 : (sz || 80) < 150 ? 14 : 18;
  const o = orient(card);
  const bc = sel ? T.silverBright : fDown ? T.textDim : TC[card.type] || T.cardBorder;
  const isMasked = mask && card.rarity === "legendary";

  const artStyle = fill
    ? { flex: "1 1 0", minHeight: 0 }  // fill: art takes remaining space after strip
    : { aspectRatio: "1/1" };           // fixed: art is square

  return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 3, overflow: "hidden", cursor: onClick ? "pointer" : "default",
      border: `1.5px solid ${bc}`, background: T.card, opacity: dim ? 0.25 : 1,
      display: "flex", flexDirection: "column", position: "relative", flexShrink: 0,
      boxShadow: sel ? `0 0 10px ${T.silver}44` : sparkle ? `0 0 20px ${T.legendary}88` : "0 1px 3px #00000066",
      transition: "all 0.12s", transform: sel ? "translateY(-2px)" : "none",
      filter: notOwned ? "grayscale(0.7) brightness(0.5)" : "none",
    }}>
      {sparkle && <div style={{
        position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
        background: `radial-gradient(circle at 30% 20%,${T.legendary}55 0%,transparent 50%),radial-gradient(circle at 70% 60%,${T.legendary}44 0%,transparent 40%)`,
        animation: "sparkleAnim 1.5s ease-out forwards"
      }} />}
      {fDown ? (
        <div style={{
          ...artStyle, display: "flex", alignItems: "center", justifyContent: "center",
          background: T.card, border: `1px solid ${T.silverDim}22`
        }}>
          <span style={{ fontFamily: FONT_TITLE, fontSize: "2.5em", color: T.silverBright, lineHeight: 1 }}>T</span>
        </div>
      ) : isMasked ? (
        <div style={{
          ...artStyle, display: "flex", alignItems: "center", justifyContent: "center",
          background: `radial-gradient(ellipse at center,${T.bg2} 0%,${T.bg1} 100%)`, position: "relative"
        }}>
          <span style={{ fontFamily: FONT_TITLE, fontSize: "3em", color: T.textDim + "22" }}>?</span>
        </div>
      ) : (
        <div style={{
          ...artStyle, background: card.image ? `url(${card.image}) center/cover` :
            `linear-gradient(145deg,${card.gradient?.[0] || DG[card.type]?.[0] || "#333"},${card.gradient?.[1] || DG[card.type]?.[1] || "#111"})`,
          position: "relative", overflow: "hidden",
        }}>
          {card.type === "entity" && <span style={{
            position: "absolute", top: 2, left: 2, fontSize: fs,
            background: "#000a", borderRadius: 2, padding: "0 3px", color: oCol(o),
            fontFamily: FONT_UI, fontWeight: 900, lineHeight: 1.4
          }}>
            {o === "light" ? "△" : o === "dark" ? "▽" : "✡"}</span>}
          {!noRar && card.rarity && (sz || 80) >= 80 && !fill && <span style={{
            position: "absolute", top: 2, right: 2, fontSize: fs,
            color: RC[card.rarity], fontFamily: FONT_UI, fontWeight: 900,
            background: "#000a", borderRadius: 2, padding: "0 3px", lineHeight: 1.4
          }}>
            {card.rarity === "legendary" ? "★" : card.rarity === "rare" ? "◆" : card.rarity === "uncommon" ? "◈" : ""}</span>}

          {owner && <div style={{
            position: "absolute", bottom: 2, left: 2, width: 5, height: 5, borderRadius: "50%",
            background: owner === "player" ? T.silver : T.curse, border: "1px solid #000"
          }} />}
        </div>
      )}
      {isMasked ? (
        <div style={{
          height: stripH, flexShrink: 0, padding: "0 3px", display: "flex", alignItems: "center", justifyContent: "center",
          background: T.card, borderTop: `1px solid ${T.panelBorder}`
        }}>
          <span style={{ fontSize: fs, color: T.textDim, fontFamily: FONT_UI, fontWeight: 800 }}>???</span>
        </div>
      ) : (
        <div style={{
          height: stripH, flexShrink: 0, padding: "0 3px", display: "flex", alignItems: "center", gap: fill ? 5 : 2,
          background: T.card, borderTop: `1px solid ${T.panelBorder}`
        }}>
          {card.type !== "entity" && <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
            <span style={{
              fontSize: fs - 1, color: TC[card.type], fontFamily: FONT_UI,
              textTransform: "uppercase", fontWeight: 800, flexShrink: 0
            }}>{card.type}</span>
            {(card.type === "blessing" || card.type === "curse") && (
              <span style={{ fontSize: fs, fontFamily: FONT_UI, fontWeight: 900, color: card.type === "blessing" ? T.bless : T.curse }}>
                {card.type === "blessing" ? "+" : "−"}{cPwr(card)}C
              </span>
            )}
          </div>}
          {card.type === "entity" && <div style={{ display: "flex", gap: fill ? 6 : (sz || 80) < 60 ? 2 : 4, width: "100%", justifyContent: "center" }}>
            {STAT_DEFS.map(s => {
              const base = card[s.key] || 0;
              const v = effStats ? (effStats[s.key] ?? base) : base;
              const buffed = effStats && v !== base;
              return (
                <span key={s.key} style={{
                  fontSize: fs, fontFamily: FONT_UI, fontWeight: 900,
                  color: v > 0 ? s.color : v < 0 ? T.curse : T.textDim,
                  textShadow: buffed ? `0 0 6px ${v > base ? s.color : T.curse}99` : "none",
                }}>{s.label}{v > 0 ? "+" : ""}{v}</span>);
            })}
          </div>}
          {(card.type === "equip" || card.type === "terrain") && <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
            {STAT_DEFS.map(s => {
              const v = card[s.key] || 0; return v !== 0 ? (
                <span key={s.key} style={{ fontSize: fs, color: v > 0 ? s.color : T.curse, fontWeight: 800 }}>{s.label}{v > 0 ? "+" : ""}{v}</span>) : null;
            })}
          </div>}
        </div>
      )}
    </div>
  );
}

// ═══ BIG FLASH — shows card art, battles, and video ═══
function Flash({ flash }) {
  useEffect(() => {
    if (flash?.video && flash?.onVideoEnd) {
      const t = setTimeout(() => flash.onVideoEnd(), 4000);
      return () => clearTimeout(t);
    }
  }, [flash]);

  if (!flash) return null;
  const isBattle = flash.atkCard && flash.defCard;
  const hasVideo = flash.video;
  const dur = isBattle ? "battleFlash 2.4s ease-out forwards" : "flashAnim 1.6s ease-out forwards";
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: hasVideo ? "auto" : "none",
      animation: hasVideo ? "none" : dur, opacity: hasVideo ? 1 : undefined,
    }}>
      <div style={{
        display: "flex", flexDirection: isBattle ? "row" : flash.image || hasVideo ? "column" : "row", alignItems: "center", gap: isBattle ? 16 : 10,
        padding: isBattle ? "20px 30px" : flash.image || hasVideo ? "16px 24px" : "10px 28px", borderRadius: 3,
        background: "#04040af0", border: `1.5px solid ${flash.border || T.silver}`,
        boxShadow: `0 0 60px ${flash.border || T.silver}33`
      }}>
        {isBattle ? (<>
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 110, height: 110, borderRadius: 4, border: `2px solid ${flash.atkWon ? T.bless : T.curse}`,
              background: `url(${flash.atkCard.image}) center/cover`, transition: "all .6s",
              animation: flash.atkWon ? "none" : "battleLoseL 1.8s ease-in forwards", animationDelay: "0.8s",
              opacity: 1
            }} />
            <div style={{
              fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, color: flash.atkWon ? T.silverBright : T.textDim,
              marginTop: 4
            }}>{flash.atkCard.name || "Attacker"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontFamily: FONT_TITLE, fontSize: 20, color: T.silver }}>VS</div>
            <div style={{
              fontSize: 9, fontFamily: FONT_UI, fontWeight: 900, letterSpacing: 2,
              color: flash.color || T.silverBright, textTransform: "uppercase"
            }}>{flash.text}</div>
            {flash.sub && <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI }}>{flash.sub}</div>}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 110, height: 110, borderRadius: 4, border: `2px solid ${!flash.atkWon ? T.bless : T.curse}`,
              background: `url(${flash.defCard.image}) center/cover`, transition: "all .6s",
              animation: !flash.atkWon ? "none" : "battleLoseR 1.8s ease-in forwards", animationDelay: "0.8s",
              opacity: 1
            }} />
            <div style={{
              fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, color: !flash.atkWon ? T.silverBright : T.textDim,
              marginTop: 4
            }}>{flash.defCard.name || "Defender"}</div>
          </div>
        </>) : (<>
          {hasVideo ? (
            <video src={flash.video} autoPlay muted playsInline
              style={{ width: 240, height: 240, borderRadius: 8, border: `3px solid ${flash.border || T.silver}66`, objectFit: "cover", boxShadow: `0 0 40px ${flash.border || T.silver}44` }}
              onEnded={() => { if (flash.onVideoEnd) flash.onVideoEnd(); }}
              onError={(e) => {
                // Fallback to static image if video fails to load
                e.target.style.display = 'none';
                if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                // Trigger the end callback early to prevent wait
                if (flash.onVideoEnd) {
                  setTimeout(() => flash.onVideoEnd(), 1800);
                }
              }} />
          ) : null}
          <div style={{
            width: 180, height: 180, borderRadius: 4,
            border: `2px solid ${flash.border || T.silver}44`,
            background: flash.image ? `url(${flash.image}) center/cover` : T.card,
            flexShrink: 0, display: hasVideo ? "none" : "flex", alignItems: "center", justifyContent: "center"
          }}>
            {!flash.image && flash.icon && (
              <span style={{
                fontFamily: FONT_TITLE, fontSize: 110, color: flash.color || T.silverBright,
                textShadow: `0 0 40px ${flash.color || T.silver}66`,
                opacity: 0.9, lineHeight: 1
              }}>{flash.icon}</span>
            )}
          </div>
          <div style={{ textAlign: "center", marginTop: hasVideo ? 12 : 0 }}>
            <div style={{
              fontFamily: FONT_UI, fontSize: hasVideo ? 28 : flash.image ? 20 : 22, fontWeight: 900, letterSpacing: hasVideo ? 6 : 4,
              color: flash.color || T.silverBright, textTransform: "uppercase",
              textShadow: `0 0 20px ${flash.color || T.silver}44`
            }}>
              {(flash.icon && flash.image) && <span style={{ marginRight: 6, fontFamily: flash.iconFont || "inherit" }}>{flash.icon}</span>}{flash.text}
            </div>
            {flash.sub && <div style={{
              fontSize: 9, letterSpacing: 2, marginTop: 2, opacity: 0.6,
              fontFamily: FONT_UI, color: flash.color || T.silverBright
            }}>{flash.sub}</div>}
          </div>
        </>)}
      </div>
    </div>
  );
}

function CDisp({ value, label }) {
  const pct = Math.min(Math.abs(value) / C_MAX, 1);
  const col = value > 0 ? T.bless : value < 0 ? T.curse : T.silver;
  const atN = value === 0;
  return (
    <div style={{
      textAlign: "center", padding: "2px 8px", background: T.panel,
      border: `1px solid ${T.panelBorder}`, borderRadius: 3, minWidth: 80
    }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 7, color: T.textDim, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>{label}</div>
      <div style={{
        fontFamily: FONT_TITLE, fontSize: 24, color: col, lineHeight: 1,
        textShadow: atN ? `0 0 14px ${T.silver}55` : "none", animation: atN ? "pulse 2.5s ease-in-out infinite" : "none"
      }}>
        {value > 0 ? "+" : ""}{value}</div>
      <div style={{ height: 2, background: "#14141a", borderRadius: 1, marginTop: 1, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: col, borderRadius: 1, transition: "width .5s" }} /></div>
      <div style={{ fontSize: 6, color: T.textDim, marginTop: 1, fontFamily: FONT_UI, letterSpacing: 1 }}>
        {atN ? "NEXUS" : value > 0 ? `${C_MAX - value}↑` : `${C_MAX + value}↓`}</div>
    </div>
  );
}

// Main
export default function Trinity() {
  const [tab, setTab] = useState("play");
  const [cardPool, setCardPool] = useState([]);
  const [coll, setColl] = useState({});
  const [decks, setDecks] = useState([]);
  const [selDI, setSelDI] = useState(0); const [oppDI, setOppDI] = useState(1);
  const [sets, setSets] = useState([]);
  const [dbR, setDbR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState(TOKENS_START);

  const [flash, setFlash] = useState(null); const fQ = useRef([]); const fB = useRef(false);
  const enqF = useCallback((text, opts = {}) => { fQ.current.push({ text, ...opts }); if (!fB.current) drF(); }, []);
  function drF() {
    if (!fQ.current.length) { fB.current = false; return; } fB.current = true;
    const f = fQ.current.shift();
    if (f.video) {
      f.onVideoEnd = () => { setFlash(null); setTimeout(drF, 120); };
      setFlash(f);
      // fallback in case video fails to fire ended
      setTimeout(() => { setFlash(null); setTimeout(drF, 120); }, 6000);
    } else {
      setFlash(f);
      const dur = f.atkCard ? 2600 : f.image ? 1800 : 1100;
      setTimeout(() => { setFlash(null); setTimeout(drF, 120); }, dur);
    }
  }

  const [game, setGame] = useState(null);
  const [selH, setSelH] = useState(null); const [selB, setSelB] = useState(null);
  const [hl, setHl] = useState([]); const [mode, setMode] = useState(null); const [tapTgt, setTapTgt] = useState(null);
  const [log, setLog] = useState([]); const logRef = useRef(null); const [aiR, setAiR] = useState(false);
  const [pit, setPit] = useState({ player: [], ai: [] }); const [showPit, setShowPit] = useState(false);
  const [recentPit, setRecentPit] = useState([]);
  const [inspCell, setInspCell] = useState(null);

  const [nc, setNc] = useState({
    name: "", type: "entity", soul: 0, mind: 0, will: 0, power: 1,
    gradient: DG.entity, image: null, rarity: "common", set: ""
  });
  const [editDeck, setEditDeck] = useState(null);
  const [deckSortMode, setDeckSortMode] = useState("type"); // "type" or "rarity"
  const [bF, setBF] = useState("all"); const [bSetF, setBSetF] = useState("all");
  const [bDet, setBDet] = useState(null); const [editN, setEditN] = useState(null);
  const [packRes, setPackRes] = useState([]); const [packFlip, setPackFlip] = useState([]); const [packSp, setPackSp] = useState([]);
  const [selSI, setSelSI] = useState(0);
  const [editCard, setEditCard] = useState(null);
  const [edF, setEdF] = useState({ set: "all", type: "all", rarity: "all", art: "all", sort: "id" }); // editor filters
  const [forgeMode, setForgeMode] = useState("single"); // "single" or "generate"
  const [genMode, setGenMode] = useState("random"); // "random" or "permute"
  const [genImages, setGenImages] = useState({}); // { rowIndex: dataUrl }
  const dragRef = useRef(null); // for drag-swap in forge table
  const [gen, setGen] = useState({
    name: "New Set", total: 20,
    pctEntity: 50, pctBless: 15, pctCurse: 15, pctTerrain: 10, pctItem: 10,
    powerMin: 2, powerMax: 6,
    blessPwrMin: 1, blessPwrMax: 3, cursePwrMin: 1, cursePwrMax: 3,
    rarCommon: 64, rarUncommon: 24, rarRare: 8, rarLegendary: 4,
  });

  // Live preview — deterministic sample that updates as sliders change
  const livePreview = useMemo(() => {
    const { total, pctEntity, pctBless, pctCurse, pctTerrain, pctItem,
      powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
      rarCommon, rarUncommon, rarRare, rarLegendary, ensureTypes } = gen;
    const counts = {
      entity: Math.round(total * pctEntity / 100), blessing: Math.round(total * pctBless / 100),
      curse: Math.round(total * pctCurse / 100), terrain: Math.round(total * pctTerrain / 100), equip: Math.round(total * pctItem / 100)
    };
    counts.entity += total - Object.values(counts).reduce((a, b) => a + b, 0);
    const rows = []; let seed = 42;
    const sR = () => { seed = (seed * 16807) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };

    let perms = [];
    if (genMode === "permute") {
      for (let s = -STAT_MAX; s <= STAT_MAX; s++) for (let m = -STAT_MAX; m <= STAT_MAX; m++) for (let w = -STAT_MAX; w <= STAT_MAX; w++) {
        if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= powerMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= powerMax) perms.push({ soul: s, mind: m, will: w });
      }
      perms = shuffle(perms);
    }
    let pIdx = 0;

    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        let s = 0, m = 0, w = 0, pwr = null;
        if (type === "entity") {
          if (genMode === "permute" && perms.length) {
            const p = perms[pIdx++ % perms.length]; s = p.soul; m = p.mind; w = p.will;
          } else {
            for (let a = 0; a < 50; a++) { s = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; m = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; w = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= powerMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= powerMax) break; }
          }
        }
        else if (type === "blessing") { pwr = blessPwrMin + Math.floor(sR() * (blessPwrMax - blessPwrMin + 1)); }
        else if (type === "curse") { pwr = cursePwrMin + Math.floor(sR() * (cursePwrMax - cursePwrMin + 1)); }
        else if (type === "terrain") { const v = [0, 0, 0]; v[Math.floor(sR() * 3)] = sR() > .5 ? 1 : -1; v[(Math.floor(sR() * 3) + 1) % 3] = sR() > .5 ? 1 : -1; s = v[0]; m = v[1]; w = v[2]; }
        else if (type === "equip") { const v = [0, 0, 0]; v[Math.floor(sR() * 3)] = 1 + Math.floor(sR() * 2); s = v[0]; m = v[1]; w = v[2]; }
        rows.push({ type, soul: s, mind: m, will: w, rarity: "common", power: pwr, id: i });
      }
    }

    // Distribute rarity: type-diverse, polarity-balanced legendaries
    const getP = c => c.power || (Math.abs(c.soul) + Math.abs(c.mind) + Math.abs(c.will));
    rows.sort((a, b) => getP(b) - getP(a));
    const totalW = rarCommon + rarUncommon + rarRare + rarLegendary;
    const assignedIds = new Set();
    const rarities = ["legendary", "rare", "uncommon"];

    rarities.forEach(rar => {
      const rarKey = rar === "legendary" ? "rarLegendary" : rar === "rare" ? "rarRare" : "rarUncommon";
      const targetCount = Math.round(total * gen[rarKey] / totalW);
      let rarAssigned = 0;

      if (ensureTypes) {
        for (const t of ["entity", "blessing", "curse", "terrain", "equip"]) {
          if (rarAssigned >= targetCount) break;
          const idx = rows.findIndex((c, i) => !assignedIds.has(c.id) && c.type === t);
          if (idx >= 0) { rows[idx].rarity = rar; assignedIds.add(rows[idx].id); rarAssigned++; }
        }
      }

      if (rar === "legendary") {
        const lpols = ["light", "dark", "balanced"]; let lpI = 0;
        rows.forEach((card) => {
          if (rarAssigned >= targetCount || assignedIds.has(card.id) || card.type !== "entity") return;
          const au = card.soul + card.mind + card.will;
          const tgt = lpols[lpI % 3];
          if ((tgt === "light" && au > 0) || (tgt === "dark" && au < 0) || (tgt === "balanced" && au === 0)) {
            card.rarity = "legendary"; assignedIds.add(card.id); rarAssigned++; lpI++;
          }
        });
      }

      rows.forEach(card => {
        if (rarAssigned >= targetCount || assignedIds.has(card.id)) return;
        card.rarity = rar; assignedIds.add(card.id); rarAssigned++;
      });
    });

    rows.forEach(card => { if (!assignedIds.has(card.id)) card.rarity = "common"; });
    return rows;
  }, [gen, genMode]);

  const addLog = useCallback(m => setLog(p => [...p.slice(-60), m]), []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  // Persist via backend API
  const API = "/api";
  const uploadFile = async (f, type = "image") => {
    const fd = new FormData(); fd.append("file", f);
    try {
      const r = await fetch(`${API}/upload/${type}`, { method: "POST", body: fd });
      if (r.ok) { const d = await r.json(); return d.path; }
    } catch (e) { console.error("Upload failed", e); }
    return null;
  };

  const saveTimer = useRef(null);
  useEffect(() => {
    (async () => {
      try {
        console.log("[Trinity] Loading state from backend...");
        const r = await fetch(`${API}/state`);
        if (r.ok) {
          const s = await r.json();
          if (s.cards) setCardPool(s.cards);
          if (s.decks) setDecks(s.decks);
          if (s.collection) setColl(s.collection);
          if (s.sets) setSets(s.sets);
          if (s.tokens !== undefined) setTokens(s.tokens);
          console.log(`[Trinity] Loaded state from backend`);
        } else { console.warn("[Trinity] Backend returned", r.status); }
      } catch (e) { console.warn("[Trinity] Backend not reachable:", e.message); }
      setDbR(true);
      setLoading(false);
    })();
  }, []);
  useEffect(() => {
    if (!dbR) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        console.log("[Trinity] Saving state...", { cards: cardPool.length, decks: decks.length, sets: sets.length });
        const r = await fetch(`${API}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cards: cardPool, decks, sets, collection: coll, tokens }),
        });
        if (r.ok) console.log("[Trinity] Saved OK");
        else console.error("[Trinity] Save failed:", r.status, await r.text());
      } catch (e) { console.warn("[Trinity] Save failed:", e.message); }
    }, 800);
  }, [cardPool, decks, sets, coll, tokens, dbR]);

  useEffect(() => {
    const s = document.createElement("style"); s.textContent = `
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes glow{0%,100%{box-shadow:0 0 4px #a8a8b822}50%{box-shadow:0 0 10px #a8a8b844}}
    @keyframes flashAnim{0%{opacity:0;transform:scale(.9)}10%{opacity:1;transform:scale(1.02)}20%{transform:scale(1)}85%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
    @keyframes battleFlash{0%{opacity:0;transform:scale(.9)}8%{opacity:1;transform:scale(1.02)}15%{transform:scale(1)}88%{opacity:1}100%{opacity:0}}
    @keyframes battleLoseL{0%{opacity:1;transform:translateX(0) scale(1)}100%{opacity:0;transform:translateX(-60px) scale(.7)}}
    @keyframes battleLoseR{0%{opacity:1;transform:translateX(0) scale(1)}100%{opacity:0;transform:translateX(60px) scale(.7)}}
    @keyframes packPop{0%{transform:rotateY(90deg) scale(.8);opacity:0}100%{transform:rotateY(0) scale(1);opacity:1}}
    @keyframes sparkleAnim{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
    @keyframes shimmerCommon{0%,100%{box-shadow:0 0 4px #55556422}50%{box-shadow:0 0 8px #55556444}}
    @keyframes shimmerUncommon{0%,100%{box-shadow:0 0 6px #a8a8b822}50%{box-shadow:0 0 14px #a8a8b855}}
    @keyframes shimmerRare{0%{box-shadow:0 0 8px #d0d0dc33;transform:scale(1)}50%{box-shadow:0 0 22px #d0d0dc66;transform:scale(1.02)}100%{box-shadow:0 0 8px #d0d0dc33;transform:scale(1)}}
    @keyframes shimmerLegendary{0%{box-shadow:0 0 10px #d8c8a044,0 0 30px #d8c8a022;transform:scale(1);filter:brightness(1)}25%{box-shadow:0 0 20px #d8c8a088,0 0 50px #d8c8a044;transform:scale(1.03);filter:brightness(1.1)}50%{box-shadow:0 0 30px #d8c8a0aa,0 0 60px #d8c8a066;transform:scale(1.01);filter:brightness(1.2)}75%{box-shadow:0 0 20px #d8c8a088,0 0 50px #d8c8a044;transform:scale(1.03);filter:brightness(1.1)}100%{box-shadow:0 0 10px #d8c8a044,0 0 30px #d8c8a022;transform:scale(1);filter:brightness(1)}}
    @keyframes trapGlow{0%,100%{box-shadow:0 0 3px #88445522}50%{box-shadow:0 0 8px #88445544}}
    *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#18181f #04040a}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#04040a}::-webkit-scrollbar-thumb{background:#18181f;border-radius:2px}
    input[type=range]{height:3px}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:#a8a8b8;cursor:pointer}
  `; document.head.appendChild(s); return () => document.head.removeChild(s);
  }, []);

  // Game engine — ownership-aware C shift helper
  // Winner pushes C toward their own win condition.
  // Player light → player wins push +C, AI wins push -C
  // Player dark  → player wins push -C, AI wins push +C
  function combatC(g, dmg, winningStat, winnerOwner, battleOpts, atkCard, defCard, atkWon, logPrefix) {
    const playerDir = g.pRole === "light" ? 1 : -1;
    const cShift = dmg * (winnerOwner === "player" ? playerDir : -playerDir);

    const absShift = Math.abs(cShift);
    const label = cShift > 0 ? `+${absShift}C` : `−${absShift}C`;
    const color = cShift > 0 ? T.bless : T.curse;

    enqF(label, { color, border: color, icon: cShift > 0 ? "A" : "C", iconFont: FONT_TITLE, ...battleOpts, atkWon });
    applyC(g, cShift);
    addLog(`${logPrefix} (${label} Meter)`);
  }

  function resolveCombat(aS, dS, stat) {
    const aV = Math.abs(aS[stat]), dV = Math.abs(dS[stat]);
    if (aV === dV) return { winner: "tie", dmg: 0 };
    if (aV > dV) return { winner: "attacker", dmg: aV - dV, winningStat: aS[stat] };
    return { winner: "defender", dmg: dV - aV, winningStat: dS[stat] };
  }
  function applyC(g, amt) {
    const prev = g.c;
    const next = Math.max(-C_MAX, Math.min(C_MAX, prev + amt));
    g.c = next;

    const crossedZero = (prev > 0 && next < 0) || (prev < 0 && next > 0) || (prev !== 0 && next === 0);
    if (crossedZero) {
      if (amt < 0 && g.pD.length && g.pRole === "light") { g.pH.push(...g.pD.splice(0, Math.min(2, g.pD.length))); addLog("⟐ AWAKENING"); enqF("AWAKENING", { color: T.balanced, border: T.balanced, icon: "A", iconFont: FONT_TITLE }); }
      else if (amt > 0 && g.aD.length && g.pRole === "light") { g.aH.push(...g.aD.splice(0, Math.min(2, g.aD.length))); addLog("⟐ REVENANCE"); enqF("REVENANCE", { color: T.balanced, border: T.balanced, icon: "R", iconFont: FONT_TITLE, sub: "Opponent" }); }
      else if (amt > 0 && g.pD.length && g.pRole === "dark") { g.pH.push(...g.pD.splice(0, Math.min(2, g.pD.length))); addLog("⟐ AWAKENING"); enqF("AWAKENING", { color: T.balanced, border: T.balanced, icon: "A", iconFont: FONT_TITLE }); }
      else if (amt < 0 && g.aD.length && g.pRole === "dark") { g.aH.push(...g.aD.splice(0, Math.min(2, g.aD.length))); addLog("⟐ REVENANCE"); enqF("REVENANCE", { color: T.balanced, border: T.balanced, icon: "R", iconFont: FONT_TITLE, sub: "Opponent" }); }
    }

    // Victory Conditions
    const winLight = g.c >= C_MAX;
    const winDark = g.c <= -C_MAX;

    if (winLight) {
      g.ph = "over";
      if (g.pRole === "light") { g.win = "player"; setTokens(t => t + TOKENS_PER_WIN); enqF("ENLIGHTENMENT", { color: "#e0e0f0", border: "#e0e0f0", icon: "E", iconFont: FONT_TITLE }); }
      else { g.win = "ai"; enqF("DEFEAT", { color: T.curse, border: T.curse }); }
    } else if (winDark) {
      g.ph = "over";
      if (g.pRole === "dark") { g.win = "player"; setTokens(t => t + TOKENS_PER_WIN); enqF("OBLIVION", { color: T.curse, border: T.curse, icon: "O", iconFont: FONT_TITLE }); }
      else { g.win = "ai"; enqF("DEFEAT", { color: T.curse, border: T.curse }); }
    }
  }
  function toPit(card, owner) { setPit(prev => ({ ...prev, [owner]: [...prev[owner], card] })); setRecentPit(prev => [{ card, owner, t: Date.now() }, ...prev].slice(0, 3)); }
  function chkTraps(g, r, c, mover) {
    const opp = mover === "player" ? "ai" : "player";
    adj(r, c).forEach(([ar, ac]) => {
      const cell = g.bd[ar]?.[ac];
      if (cell && cell.fd && cell.ow === opp && (cell.cd.type === "blessing" || cell.cd.type === "curse")) {
        cell.fd = false;
        const pwr = cPwr(cell.cd);
        const cn = cell.cd.name || cell.cd.type;
        if (cell.cd.type === "blessing") {
          enqF("TRAP REVEALED", { color: T.bless, border: T.bless, icon: "⚡", image: cell.cd.image, sub: `${cn} → +${pwr}C Meter` });
          applyC(g, pwr);
          addLog(`⚡ TRAP ${cn}: +${pwr}C Meter`);
        } else {
          enqF("TRAP REVEALED", { color: T.curse, border: T.curse, icon: "⚡", image: cell.cd.image, sub: `${cn} → −${pwr}C Meter` });
          applyC(g, -pwr);
          addLog(`⚡ TRAP ${cn}: −${pwr}C Meter`);
        }
        toPit(cell.cd, opp); g.bd[ar][ac] = null;
      }
    });
  }
  function flipSets(g, ow) {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cell = g.bd[r][c];
      if (cell && cell.fd && cell.ow === ow && (cell.cd.type === "blessing" || cell.cd.type === "curse")) {
        cell.fd = false;
        const pwr = cPwr(cell.cd);
        if (cell.cd.type === "blessing") { enqF(`+${pwr}C`, { color: T.bless, border: T.bless, image: cell.cd.image }); applyC(g, pwr); addLog(`⚡ TRAP! ${cell.cd.name || "Blessing"} (+${pwr}C Meter)`); }
        else { enqF(`−${pwr}C`, { color: T.curse, border: T.curse, image: cell.cd.image }); applyC(g, -pwr); addLog(`⚡ TRAP! ${cell.cd.name || "Curse"} (−${pwr}C Meter)`); }
        toPit(cell.cd, ow); g.bd[r][c] = null;
      }
    }
  }

  function chkPressure(g) {
    if (g.ph === "over") return;
    let pCount = 0, aCount = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cl = g.bd[r][c];
      if (cl?.cd.type === "entity" && !cl.fd) {
        if (cl.ow === "player") pCount++; else aCount++;
      }
    }
    const playerDir = g.pRole === "light" ? 1 : -1;
    if (pCount > 0 && aCount === 0) {
      addLog(`✧ PRESENCE: ${playerDir > 0 ? "+1" : "-1"}C`);
      enqF("PRESENCE", { color: playerDir > 0 ? T.bless : T.curse, icon: "P", iconFont: FONT_TITLE, sub: `${playerDir > 0 ? "+1" : "-1"}C Meter Shift` });
      applyC(g, playerDir);
    } else if (aCount > 0 && pCount === 0) {
      const shift = -playerDir;
      const label = shift > 0 ? `+${shift}` : `−${Math.abs(shift)}`;
      addLog(`✧ OPP PRESENCE: ${label}C`);
      enqF("PRESENCE", { color: shift > 0 ? T.bless : T.curse, icon: "P", iconFont: FONT_TITLE, sub: `Opp ${label}C Meter Shift` });
      applyC(g, -playerDir);
    }
  }

  function startGame() {
    const pIds = decks[selDI]?.cards || []; const aIds = decks[oppDI]?.cards || [];
    const pD = shuffle(pIds.map(id => gc(id, cardPool)).filter(Boolean));
    const aD = shuffle(aIds.map(id => gc(id, cardPool)).filter(Boolean));
    const pDk = decks[selDI];
    const pMag = getDeckMagnitude(pDk, cardPool);
    const pRole = pMag < 0 ? "dark" : "light";
    const turn = Math.random() < 0.5 ? "player" : "ai";
    const startG = {
      bd: Array.from({ length: 5 }, () => Array(5).fill(null)),
      pH: pD.splice(0, HAND_SIZE), aH: aD.splice(0, HAND_SIZE),
      pD, aD, c: 0, turn, act: 3, tn: 1, ph: "playing", win: null, pRole
    };
    setGame(startG);
    setPit({ player: [], ai: [] }); clr(); setLog([`0C. ${turn === "player" ? "Your" : "Opponent"} turn.`]);
    if (turn === "ai") {
      setAiR(true);
      setTimeout(() => runAI(startG, 0), 1000);
    }
    enqF("Genesis", { color: T.silverBright, border: T.silver, icon: "G" });
  }
  function clr() { setSelH(null); setSelB(null); setHl([]); setMode(null); setTapTgt(null); setInspCell(null); }
  function forfeit() { setGame(null); setLog([]); setAiR(false); setPit({ player: [], ai: [] }); setRecentPit([]); setInspCell(null); }

  function drawCard() {
    if (!game || game.ph !== "playing" || game.turn !== "player" || game.act <= 0 || !game.pD.length) return;
    const g = { ...game, pD: [...game.pD], pH: [...game.pH] };
    const c = g.pD.shift(); g.pH.push(c); g.act--;
    enqF("DRAW", { color: T.silver, border: T.silverDim, image: c.image, sub: c.name || "Card" });
    addLog(`Draw: ${c.name || "Card"}`);
    setGame(g); clr();
  }
  function selectHand(idx) {
    if (!game || game.turn !== "player" || game.act <= 0 || game.ph !== "playing") return;
    const c = game.pH[idx]; setSelH(idx); setSelB(null);
    if (c.type === "entity") { const cells = []; for (let r = 3; r < 5; r++) for (let col = 0; col < 5; col++) if (!game.bd[r][col]) cells.push([r, col]); setHl(cells); setMode("summon"); }
    else if (c.type === "blessing" || c.type === "curse") { setHl([]); setMode(c.type); }
    else if (c.type === "terrain") {
      if (game.act < 2) return;
      const cells = [];
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        if (!game.bd[r][col] && !hasAdjTerrain(r, col, game.bd)) cells.push([r, col]);
      }
      setHl(cells); setMode("terrain");
    }
    else if (c.type === "equip") { const cells = []; for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) { const cl = game.bd[r][col]; if (cl?.ow === "player" && cl.cd.type === "entity") cells.push([r, col]); } setHl(cells); setMode("equip"); }
  }
  function playBC(type) {
    if (!game || selH === null) return; const c = game.pH[selH]; const cost = game.c === 0 ? 0 : 1;
    if (game.act < cost) return; const g = { ...game, pH: [...game.pH], bd: game.bd.map(r => [...r]) };
    g.pH.splice(selH, 1); g.act -= cost;
    const pwr = cPwr(c);
    if (type === "blessing") { enqF(`+${pwr}C`, { color: T.bless, border: T.bless, icon: "△", image: c.image, video: c.video }); applyC(g, pwr); addLog(`Play: ${c.name || "Blessing"} (+${pwr}C)`); }
    else { enqF(`−${pwr}C`, { color: T.curse, border: T.curse, icon: "▽", image: c.image, video: c.video }); applyC(g, -pwr); addLog(`Play: ${c.name || "Curse"} (−${pwr}C)`); }
    toPit(c, "player"); setGame(g); clr();
  }
  function doSetTrap() {
    if (!game || selH === null) return;
    const cells = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!game.bd[r][c]) cells.push([r, c]);
    setHl(cells); setMode("setTrap");
  }
  function boardClick(r, c) {
    if (!game || game.turn !== "player" || game.ph !== "playing" || aiR) return;
    const isH = hl.some(([hr, hc]) => hr === r && hc === c);
    if (mode === "setTrap" && selH !== null && isH) {
      const g = { ...game, pH: [...game.pH], bd: game.bd.map(row => [...row]) };
      const card = g.pH.splice(selH, 1)[0]; g.bd[r][c] = { cd: card, ow: "player", fd: true };
      enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "▼", image: card.image });
      addLog(`Set: Trap`);
      setGame(g); clr(); return;
    }
    if ((mode === "summon" || mode === "terrain") && selH !== null && isH) {
      const cost = mode === "terrain" ? 2 : 1;
      if (game.act < cost) return;
      const g = { ...game, pH: [...game.pH], bd: game.bd.map(row => [...row]) };
      const card = g.pH.splice(selH, 1)[0];
      g.bd[r][c] = { cd: card, ow: "player", fd: false, ib: { soul: 0, mind: 0, will: 0 } }; g.act -= cost;
      enqF(mode === "summon" ? "SUMMON" : "TERRAIN", { color: T.silver, border: TC[card.type], image: card.image, video: card.video, sub: card.name });
      addLog(`${mode === "summon" ? "Summon" : "Terrain"}: ${card.name || card.type}`);
      setGame(g); clr(); return;
    }
    if (mode === "equip" && selH !== null && isH) {
      const g = { ...game, pH: [...game.pH], bd: game.bd.map(row => [...row]) };
      const item = g.pH.splice(selH, 1)[0]; const cell = { ...g.bd[r][c] };
      STAT_DEFS.forEach(s => { cell.ib[s.key] = (cell.ib?.[s.key] || 0) + (item[s.key] || 0); });
      g.bd[r][c] = cell; g.act--;
      enqF("EQUIP", { color: T.item, border: T.item, icon: "⊕", image: item.image });
      addLog(`Equip: ${item.name || item.type}`);
      toPit(item, "player");
      setGame(g); clr(); return;
    }
    const cell = game.bd[r][c];
    if (cell?.ow === "player" && cell.cd.type === "entity" && !cell.fd && mode !== "chooseStat") {
      setSelB([r, c]); setSelH(null); setInspCell([r, c]); const isT = aura(cell.cd) === 0;
      const a = adj(r, c, isT ? 2 : 1);
      setHl([...a.filter(([ar, ac]) => !game.bd[ar][ac]), ...a.filter(([ar, ac]) => { const t = game.bd[ar]?.[ac]; return t && t.ow === "ai" && t.cd.type === "entity" && !t.fd; })]);
      setMode("moveOrTap"); return;
    }
    // Inspect: click any occupied cell when no mode is active
    if (cell && !mode && !selH) { setInspCell([r, c]); return; }
    if (mode === "moveOrTap" && selB && isH) {
      const [sr, sc] = selB;
      if (!game.bd[r][c]) {
        if (game.act <= 0) return;
        const g = { ...game, bd: game.bd.map(row => [...row]) }; g.bd[r][c] = g.bd[sr][sc]; g.bd[sr][sc] = null; g.act--; chkTraps(g, r, c, "player"); setGame(g); clr();
      }
      else if (game.bd[r][c]?.ow === "ai") { if (game.act <= 0) return; setTapTgt([r, c]); setMode("chooseStat"); setHl([]); }
    }
  }
  function resolveTap(stat) {
    if (!game || !selB || !tapTgt) return; const [ar, ac] = selB; const [dr, dc] = tapTgt;
    const atk = game.bd[ar][ac]; const def = game.bd[dr][dc]; if (!atk || !def) return;
    const aS = getEff(atk.cd, game.bd, ar, ac, atk.ib); const dS = getEff(def.cd, game.bd, dr, dc, def.ib);
    const result = resolveCombat(aS, dS, stat); const g = { ...game, bd: game.bd.map(row => [...row]) }; g.act--;
    const battleOpts = { atkCard: atk.cd, defCard: def.cd, sub: `${stat.toUpperCase()} |${aS[stat]}| vs |${dS[stat]}|` };
    const aVal = Math.abs(aS[stat]); const dVal = Math.abs(dS[stat]);
    if (result.winner === "attacker") {
      // Player's entity won — ownerFactor = +1 (player)
      g.bd[dr][dc] = null; toPit(def.cd, "ai");
      combatC(g, result.dmg, result.winningStat, "player", battleOpts, atk.cd, def.cd, true,
        `⚔ ${atk.cd.name || "Atk"} |${aVal}| > ${def.cd.name || "Def"} |${dVal}|`);
    } else if (result.winner === "defender") {
      // AI's entity won — ownerFactor = -1 (ai)
      g.bd[ar][ac] = null; toPit(atk.cd, "player");
      combatC(g, result.dmg, result.winningStat, "ai", battleOpts, atk.cd, def.cd, false,
        `⚔ ${atk.cd.name || "Atk"} |${aVal}| < ${def.cd.name || "Def"} |${dVal}|`);
    } else { enqF("TIE", { color: T.textDim, border: T.textDim, ...battleOpts }); addLog(`⚔ ${atk.cd.name || "Atk"} |${aVal}| = ${def.cd.name || "Def"} |${dVal}| (Tie)`); }
    setGame(g); clr();
  }
  function endTurn() {
    if (!game || game.turn !== "player" || aiR) return;
    const g = { ...game, bd: game.bd.map(r => [...r]), aH: [...game.aH], aD: [...game.aD] };
    g.turn = "ai"; g.act = 3; if (g.aD.length) g.aH.push(g.aD.shift()); flipSets(g, "ai"); g.tn++;
    chkPressure(g);
    setGame(g); clr(); addLog("— Opp —"); setAiR(true); setTimeout(() => runAI(g, 0), 500 + Math.random() * 1500);
  }

  function runAI(g, idx) {
    if (g.ph === "over" || idx >= 3 || g.act <= 0) {
      g.turn = "player"; g.act = 3; flipSets(g, "player");
      if (g.pD.length) { g.pH = [...g.pH]; g.pD = [...g.pD]; g.pH.push(g.pD.shift()); }
      chkPressure(g);
      setGame({ ...g }); setAiR(false); return;
    }
    let s = { ...g, bd: g.bd.map(r => [...r]), aH: [...g.aH], aD: [...g.aD] };
    let acted = false;

    // Aggressive AI Tactics:
    // 1. ALWAYS check for winning attacks first across the entire board
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cl = s.bd[r][c];
        if (!cl || cl.ow !== "ai" || cl.cd.type !== "entity" || cl.fd) continue;
        const aRange = aura(cl.cd) === 0 ? 2 : 1;
        for (const [tr, tc] of adj(r, c, aRange)) {
          const tg = s.bd[tr][tc];
          if (!tg || tg.ow !== "player" || tg.cd.type !== "entity" || tg.fd) continue;

          const aS = getEff(cl.cd, s.bd, r, c, cl.ib);
          const dS = getEff(tg.cd, s.bd, tr, tc, tg.ib);

          // Find if there's any stat where AI wins ABSOLUTELY
          let bestStat = null, maxDmg = 0;
          for (const st of STAT_DEFS) {
            const res = resolveCombat(aS, dS, st.key);
            if (res.winner === "attacker" && res.dmg > maxDmg) {
              maxDmg = res.dmg;
              bestStat = st.key;
            }
          }

          if (bestStat) {
            const res = resolveCombat(aS, dS, bestStat);
            const aiBO = { atkCard: cl.cd, defCard: tg.cd, sub: `Opp ${bestStat.toUpperCase()} |${aS[bestStat]}| vs |${dS[bestStat]}|` };
            s.bd[tr][tc] = null; toPit(tg.cd, "player"); s.act--;
            combatC(s, res.dmg, res.winningStat, "ai", aiBO, cl.cd, tg.cd, true,
              `⚔ Opp ${cl.cd.name || "Atk"} |${Math.abs(aS[bestStat])}| > ${tg.cd.name || "Def"} |${Math.abs(dS[bestStat])}|`);
            setGame({ ...s });
            setTimeout(() => runAI(s, idx + 1), 700 + Math.random() * 800);
            return;
          }
        }
      }
    }

    // 2. If no winning attacks, proceed with other actions randomized
    const tier1 = shuffle(["summon", "move"]);
    const tier2 = shuffle(["spell", "equip", "terrain"]);
    const tier3 = shuffle(["trap", "draw"]);
    const actions = [...tier1, ...tier2, ...tier3];

    for (const action of actions) {
      if (acted) break;

      if (action === "summon") {
        const ents = s.aH.filter(x => x.type === "entity");
        if (ents.length) {
          const empty = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) empty.push([r, c]);
          if (empty.length) {
            const card = ents[Math.floor(Math.random() * ents.length)]; s.aH.splice(s.aH.indexOf(card), 1);
            const [sr, sc] = empty[Math.floor(Math.random() * empty.length)]; s.bd[sr][sc] = { cd: card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 } };
            s.act--;
            enqF("SUMMON", { color: T.entity, border: T.entity, sub: "Opponent", image: card.image });
            addLog(`Opp Summon: ${card.name || card.type}`);
            acted = true;
          }
        }
      }

      else if (action === "spell") {
        const spells = s.aH.filter(x => x.type === "blessing" || x.type === "curse");
        if (spells.length) {
          // AI wants C toward its own win condition
          // If player is light, AI wants -C. If player is dark, AI wants +C.
          const aiWantsPlus = s.pRole === "dark";
          const validSpells = spells.filter(sp => {
            if (aiWantsPlus) return sp.type === "blessing";
            return sp.type === "curse";
          });

          if (validSpells.length) {
            const sp = validSpells[Math.floor(Math.random() * validSpells.length)];
            s.aH.splice(s.aH.indexOf(sp), 1);
            const isB = sp.type === "blessing";
            const pwr = cPwr(sp); s.act--;
            if (isB) { enqF(`+${pwr}C`, { color: T.bless, border: T.bless, icon: "\u25b3", image: sp.image, video: sp.video }); applyC(s, pwr); addLog(`Opp Play: ${sp.name || "Blessing"} (+${pwr}C)`); }
            else { enqF(`\u2212${pwr}C`, { color: T.curse, border: T.curse, icon: "\u25bd", image: sp.image, video: sp.video }); applyC(s, -pwr); addLog(`Opp Play: ${sp.name || "Curse"} (−${pwr}C)`); }
            toPit(sp, "ai"); acted = true;
          }
        }
      }

      else if (action === "trap") {
        // AI sets traps on player's side (rows 3-4)
        const trappable = s.aH.filter(x => x.type === "blessing" || x.type === "curse");
        if (trappable.length && Math.random() < 0.15) {
          const aiWantsPlus = s.pRole === "dark";
          const validTraps = trappable.filter(sp => {
            if (aiWantsPlus) return sp.type === "blessing";
            return sp.type === "curse";
          });

          if (validTraps.length) {
            const empty = []; for (let r = 3; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) empty.push([r, c]);
            if (empty.length) {
              const card = validTraps[Math.floor(Math.random() * validTraps.length)]; s.aH.splice(s.aH.indexOf(card), 1);
              const [tr, tc] = empty[Math.floor(Math.random() * empty.length)];
              s.bd[tr][tc] = { cd: card, ow: "ai", fd: true }; s.act--;
              enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "S", sub: "Opponent" });
              addLog(`Opp Set: Trap`);
              acted = true;
            }
          }
        }
      }

      else if (action === "terrain") {
        const terrains = s.aH.filter(x => x.type === "terrain");
        if (terrains.length) {
          // Prefer placing near own entities for buffs, but MUST obey adjacency rule
          const candidates = [];
          for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
            if (s.bd[r][c] || hasAdjTerrain(r, c, s.bd)) continue;
            const nearAlly = adj(r, c).some(([ar, ac]) => s.bd[ar]?.[ac]?.ow === "ai" && s.bd[ar][ac].cd.type === "entity");
            candidates.push({ r, c, priority: nearAlly ? 2 : 1 });
          }
          if (candidates.length) {
            candidates.sort((a, b) => b.priority - a.priority);
            const best = candidates.filter(x => x.priority === candidates[0].priority);
            const { r: tr, c: tc } = best[Math.floor(Math.random() * best.length)];
            const card = terrains[Math.floor(Math.random() * terrains.length)]; s.aH.splice(s.aH.indexOf(card), 1);
            s.bd[tr][tc] = { cd: card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 } }; s.act -= 2;
            enqF("TERRAIN", { color: TC.terrain, border: TC.terrain, sub: "Opponent", image: card.image });
            addLog(`Opp Terrain: ${card.name || "Terrain"}`);
            acted = true;
          }
        }
      }

      else if (action === "equip") {
        const equips = s.aH.filter(x => x.type === "equip");
        if (equips.length) {
          // Find AI entities on the board to equip
          const aiEnts = [];
          for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
            const cl = s.bd[r][c]; if (cl?.ow === "ai" && cl.cd.type === "entity" && !cl.fd) aiEnts.push({ r, c });
          }
          if (aiEnts.length) {
            const item = equips[Math.floor(Math.random() * equips.length)]; s.aH.splice(s.aH.indexOf(item), 1);
            const { r: er, c: ec } = aiEnts[Math.floor(Math.random() * aiEnts.length)];
            const cell = { ...s.bd[er][ec] };
            STAT_DEFS.forEach(st => { cell.ib[st.key] = (cell.ib?.[st.key] || 0) + (item[st.key] || 0); });
            s.bd[er][ec] = cell; s.act--;
            enqF("EQUIP", { color: T.equip, border: T.equip, icon: "\u2295", image: item.image, sub: "Opponent" });
            addLog(`Opp Equip: ${item.name || "Equip"}`);
            toPit(item, "ai"); acted = true;
          }
        }
      }

      else if (action === "move") {
        // Find all AI entities and player entity positions
        const aiEnts = [], pTgts = [];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
          const cl = s.bd[r][c]; if (!cl) continue;
          if (cl.ow === "ai" && cl.cd.type === "entity" && !cl.fd) aiEnts.push({ r, c, cd: cl.cd });
          if (cl.ow === "player" && cl.cd.type === "entity" && !cl.fd) pTgts.push({ r, c });
        }
        // ONLY move if there are player targets to pursue
        if (pTgts.length > 0) {
          if (aiEnts.length) {
          const dist = (r1, c1, r2, c2) => Math.abs(r1 - r2) + Math.abs(c1 - c2);
          // Sort: entities furthest from any player entity move first
          aiEnts.sort((a, b) => {
            const aMin = Math.min(...pTgts.map(t => dist(a.r, a.c, t.r, t.c)));
            const bMin = Math.min(...pTgts.map(t => dist(b.r, b.c, t.r, t.c)));
            return bMin - aMin;
          });
          for (const ent of aiEnts) {
            if (acted) break;
            const moves = adj(ent.r, ent.c).filter(([nr, nc]) => !s.bd[nr][nc]);
            if (!moves.length) continue;
            // Pick move that minimizes distance to closest player entity (must be BETTER than current)
            let bestMove = null, bestDist = Math.min(...pTgts.map(t => dist(ent.r, ent.c, t.r, t.c)));
            for (const [nr, nc] of moves) {
              const d = Math.min(...pTgts.map(t => dist(nr, nc, t.r, t.c)));
              if (d < bestDist) { bestDist = d; bestMove = [nr, nc]; }
            }
            if (bestMove) {
              const [nr, nc] = bestMove;
              s.bd[nr][nc] = s.bd[ent.r][ent.c]; s.bd[ent.r][ent.c] = null; s.act--;
              chkTraps(s, nr, nc, "ai"); addLog(`Opp Move: ${ent.cd.name || "Entity"}`); acted = true;
            }
          }
        }
      }
    }

      else if (action === "draw") {
        if (s.aD.length) { s.aH.push(s.aD.shift()); s.act--; enqF("DRAW", { color: T.silverDim, border: T.silverDim, icon: "D", sub: "Opponent" }); addLog(`Opp Draw`); acted = true; }
      }
    }

    setGame({ ...s }); setTimeout(() => runAI(s, idx + 1), 500 + Math.random() * 1500);
  }

  // Forge / import
  async function handleImg(e) {
    const f = e.target.files[0]; if (!f) return;
    const path = await uploadFile(f);
    if (path) setNc(p => ({ ...p, image: path }));
  }
  async function handleBulk(e) {
    const files = Array.from(e.target.files);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = await uploadFile(f);
      if (path) {
        setCardPool(p => [...p, {
          id: "imp_" + Date.now() + "_" + i, name: "", type: "entity",
          soul: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          mind: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          will: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          rarity: ["common", "common", "uncommon", "rare"][Math.floor(Math.random() * 4)],
          gradient: DG.entity, image: path, set: nc.set || "Imported"
        }]);
      }
    }
  }
  function createCard() {
    const id = "c_" + Date.now(); const card = { ...nc, id };
    if (!["entity", "terrain", "equip"].includes(nc.type)) STAT_DEFS.forEach(s => { card[s.key] = 0; });
    setCardPool(p => [...p, card]); setNc(p => ({ ...p, name: "", image: null }));
  }
  function updateCard(id, updates) { setCardPool(p => p.map(c => c.id === id ? { ...c, ...updates } : c)); }
  function togSet(si, cid) {
    setSets(p => {
      const u = [...p]; const s = { ...u[si] };
      s.cardIds = s.cardIds.includes(cid) ? s.cardIds.filter(id => id !== cid) : [...s.cardIds, cid]; u[si] = s; return u;
    });
  }
  function ripPack(setObj) {
    if (tokens < PACK_COST) return;
    const sc = cardPool.filter(c => setObj.cardIds.includes(c.id)); if (!sc.length) return;
    setTokens(t => t - PACK_COST);
    const pack = [];
    for (let i = 0; i < 5; i++) {
      let totalW = 0; for (const c of sc) totalW += c.weight || 100;
      let roll = Math.random() * totalW; let pick = sc[0];
      for (const c of sc) { roll -= (c.weight || 100); if (roll <= 0) { pick = c; break; } }
      pack.push(pick);
    }
    setColl(prev => { const n = { ...prev }; pack.forEach(c => { n[c.id] = (n[c.id] || 0) + 1; }); return n; });
    setPackRes(pack); setPackFlip(pack.map(() => false)); setPackSp(pack.map(c => c.rarity === "legendary"));
    enqF("PACK OPENED", { color: T.silverBright, border: T.silver, icon: "◈" });
  }

  // ═══ SET GENERATOR ═══
  function generateSet() {
    const { name, total, pctEntity, pctBless, pctCurse, pctTerrain, pctItem,
      powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
      rarCommon, rarUncommon, rarRare, rarLegendary } = gen;
    const ts = Date.now(); const newCards = [];
    const rarPower = {
      common: [powerMin, Math.min(powerMin + 2, powerMax)],
      uncommon: [Math.max(powerMin, Math.floor((powerMin + powerMax) / 2) - 1), Math.min(Math.floor((powerMin + powerMax) / 2) + 1, powerMax)],
      rare: [Math.max(powerMin + 1, powerMax - 2), powerMax], legendary: [Math.max(powerMin + 2, powerMax - 1), powerMax]
    };
    function pickRarity() { const r = Math.random() * 100; return r < rarCommon ? "common" : r < rarCommon + rarUncommon ? "uncommon" : r < rarCommon + rarUncommon + rarRare ? "rare" : "legendary"; }
    function allPerms(pMin, pMax) {
      const p = [];
      for (let s = -STAT_MAX; s <= STAT_MAX; s++) for (let m = -STAT_MAX; m <= STAT_MAX; m++) for (let w = -STAT_MAX; w <= STAT_MAX; w++) { if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= pMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= pMax) p.push({ soul: s, mind: m, will: w }); }
      return p;
    }
    function randStatForRarity(rar) {
      const [pMin, pMax] = rarPower[rar];
      for (let a = 0; a < 100; a++) {
        const s = Math.floor(Math.random() * (STAT_MAX * 2 + 1)) - STAT_MAX, m = Math.floor(Math.random() * (STAT_MAX * 2 + 1)) - STAT_MAX, w = Math.floor(Math.random() * (STAT_MAX * 2 + 1)) - STAT_MAX;
        if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= pMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= pMax) return { soul: s, mind: m, will: w };
      } return { soul: 1, mind: 1, will: 0 };
    }
    function gradFor(type, o) {
      const h = type === "blessing" ? 210 : type === "curse" ? 350 : type === "terrain" ? 80 : type === "equip" ? 30 : o > 0 ? 40 : o < 0 ? 280 : 170;
      const sat = type === "entity" ? 20 : 15, b = 18 + Math.floor(Math.random() * 22);
      return [`hsl(${h},${sat + Math.floor(Math.random() * 10)}%,${b}%)`, `hsl(${h},${sat}%,${Math.floor(b / 2)}%)`];
    }
    function rPwr(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

    const counts = {
      entity: Math.round(total * pctEntity / 100), blessing: Math.round(total * pctBless / 100),
      curse: Math.round(total * pctCurse / 100), terrain: Math.round(total * pctTerrain / 100), equip: Math.round(total * pctItem / 100)
    };
    counts.entity += total - Object.values(counts).reduce((a, b) => a + b, 0);
    const perms = genMode === "permute" ? shuffle([...allPerms(powerMin, powerMax)]) : null;
    let pIdx = 0;

    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        let stats, pwr;
        if (type === "entity") { stats = perms ? perms[pIdx++ % perms.length] : randStatForRarity("common"); }
        else if (type === "blessing") { stats = { soul: 0, mind: 0, will: 0 }; pwr = rPwr(blessPwrMin, blessPwrMax); }
        else if (type === "curse") { stats = { soul: 0, mind: 0, will: 0 }; pwr = rPwr(cursePwrMin, cursePwrMax); }
        else if (type === "terrain") { const v = [0, 0, 0]; v[Math.floor(Math.random() * 3)] = Math.random() > .5 ? 1 : -1; v[(Math.floor(Math.random() * 3) + 1) % 3] = Math.random() > .5 ? 1 : -1; stats = { soul: v[0], mind: v[1], will: v[2] }; }
        else { const v = [0, 0, 0]; v[Math.floor(Math.random() * 3)] = 1 + Math.floor(Math.random() * 2); stats = { soul: v[0], mind: v[1], will: v[2] }; }
        const card = {
          id: `gen_${ts}_${type[0]}${i}`, name: "", type, ...stats,
          rarity: "common", set: name, weight: 100, image: null
        };
        if (pwr) card.power = pwr;
        newCards.push(card);
      }
    }

    // Distribute rarity — type-diverse, polarity-balanced legendaries
    const getP = c => c.power || (Math.abs(c.soul) + Math.abs(c.mind) + Math.abs(c.will));
    newCards.sort((a, b) => getP(b) - getP(a));
    const totalW = rarCommon + rarUncommon + rarRare + rarLegendary;
    const assignedIds = new Set();
    const rarities = ["legendary", "rare", "uncommon"];

    rarities.forEach(rar => {
      const rarKey = rar === "legendary" ? "rarLegendary" : rar === "rare" ? "rarRare" : "rarUncommon";
      const targetCount = Math.round(total * gen[rarKey] / totalW);
      let rarAssigned = 0;

      if (gen.ensureTypes) {
        for (const t of ["entity", "blessing", "curse", "terrain", "equip"]) {
          if (rarAssigned >= targetCount) break;
          const card = newCards.find(c => !assignedIds.has(c.id) && c.type === t);
          if (card) { card.rarity = rar; assignedIds.add(card.id); rarAssigned++; }
        }
      }

      if (rar === "legendary") {
        const pols = ["light", "dark", "balanced"]; let polIdx = 0;
        for (const card of newCards) {
          if (rarAssigned >= targetCount || assignedIds.has(card.id) || card.type !== "entity") continue;
          const au = card.soul + card.mind + card.will;
          const tgt = pols[polIdx % 3];
          if ((tgt === "light" && au > 0) || (tgt === "dark" && au < 0) || (tgt === "balanced" && au === 0)) {
            card.rarity = "legendary"; assignedIds.add(card.id); rarAssigned++; polIdx++;
          }
        }
      }

      for (const card of newCards) {
        if (rarAssigned >= targetCount || assignedIds.has(card.id)) continue;
        card.rarity = rar; assignedIds.add(card.id); rarAssigned++;
      }
    });

    newCards.forEach(card => { if (!assignedIds.has(card.id)) card.rarity = "common"; });

    // Assign images from forge table + gradients as fallback
    newCards.forEach((card, ci) => {
      if (genImages[ci]) { card.image = genImages[ci]; }
      else {
        card.gradient = card.type === "entity"
          ? gradFor(card.type, card.soul + card.mind + card.will)
          : DG[card.type] || DG.entity;
      }
    });

    setCardPool(prev => [...prev, ...newCards]);
    setSets(prev => [...prev, { id: "gen_" + ts, name, cardIds: newCards.map(c => c.id) }]);
    enqF("SET GENERATED", { color: T.silverBright, border: T.silver, icon: "◈", sub: `${newCards.length} cards → ${name}` });
    return newCards.length;
  }

  const owned = id => coll[id] || 0;
  const isH = (r, c) => hl.some(([hr, hc]) => hr === r && hc === c);
  const B = (col, dis) => ({ padding: "8px 16px", background: dis ? T.panelBorder : col + "12", border: `1px solid ${dis ? T.panelBorder : col}`, borderRadius: 2, color: dis ? T.textDim : col, cursor: dis ? "not-allowed" : "pointer", fontFamily: FONT_UI, fontSize: 11, letterSpacing: 1, fontWeight: 700 });
  const LBL = { fontFamily: FONT_UI, fontSize: 7, color: T.textDim, letterSpacing: 2, display: "block", marginBottom: 1, textTransform: "uppercase", fontWeight: 700 };
  const INP = { width: "100%", padding: "4px 7px", background: T.bg2, border: `1px solid ${T.panelBorder}`, borderRadius: 2, color: T.text, fontFamily: FONT_BODY, fontSize: 12, outline: "none" };

  const tabs = [["play", "Play"], ["browse", "Codex"], ["decks", "Decks"], ["packs", "Packs"], ["create", "Forge"], ["editor", "Editor"]];

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: T.bg, color: T.text, fontFamily: FONT_BODY, display: "flex", flexDirection: "column" }}>
      <Flash flash={flash} />
      {loading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000, background: T.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 20
        }}>
          <div style={{ fontFamily: FONT_TITLE, fontSize: 40, color: T.white, letterSpacing: 8, animation: "pulse 2s infinite" }}>TRINITY</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 10, color: T.silver, letterSpacing: 4 }}>LOADING STATE...</div>
        </div>
      )}
      <header style={{ background: T.bg2, borderBottom: `1px solid ${T.panelBorder}`, padding: "4px 12px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_TITLE, fontSize: 22, color: T.white, lineHeight: 1 }}>Trinity</span>
        <div style={{ width: 1, height: 18, background: T.panelBorder }} />
        <nav style={{ display: "flex", gap: 1 }}>
          {tabs.map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "3px 8px", background: tab === id ? T.white + "08" : "transparent",
              border: `1px solid ${tab === id ? T.silverDim : "transparent"}`, borderRadius: 2, cursor: "pointer",
              color: tab === id ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 7, letterSpacing: 2,
              textTransform: "uppercase", fontWeight: tab === id ? 900 : 500
            }}>{l}</button>))}
        </nav>
      </header>

      <main style={{ flex: 1, overflow: tab === "play" && game ? "hidden" : "auto", padding: "6px 10px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>

        {/* ═══ PLAY LOBBY ═══ */}
        {tab === "play" && !game && (
          <div style={{ textAlign: "center", padding: "24px 16px", animation: "fadeIn .5s" }}>
            <div style={{ fontFamily: FONT_TITLE, fontSize: 48, color: T.white, lineHeight: 1 }}>Trinity</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 8, color: T.silverDim, letterSpacing: 7, marginTop: 2, marginBottom: 18, fontWeight: 600 }}>THE WAR IN HEAVEN</div>
            <div style={{ maxWidth: 450, margin: "0 auto 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
              {[["GOOD", selDI, setSelDI, T.silverBright], ["EVIL", oppDI, setOppDI, T.curse]].map(([lb, sel, setSel, col], sideIdx) => {
                const isEvil = sideIdx === 1;
                const pMag = getDeckMagnitude(decks[selDI], cardPool);
                return (
                  <div key={lb} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 2, marginBottom: 3, fontWeight: 700 }}>{lb}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {decks.map((d, i) => {
                        const mag = getDeckMagnitude(d, cardPool);
                        let disabled = false;
                        if (isEvil) {
                          if (pMag > 0 && mag > 0) disabled = true;
                          if (pMag < 0 && mag < 0) disabled = true;
                        }
                        return (
                          <button key={i} onClick={() => {
                            setSel(i);
                            if (!isEvil) {
                              const nextPMag = getDeckMagnitude(d, cardPool);
                              const oppMag = getDeckMagnitude(decks[oppDI], cardPool);
                              if ((nextPMag > 0 && oppMag > 0) || (nextPMag < 0 && oppMag < 0)) {
                                const compat = decks.findIndex((dk, idx) => {
                                  const m = getDeckMagnitude(dk, cardPool);
                                  return nextPMag > 0 ? m <= 0 : m >= 0;
                                });
                                if (compat !== -1) setOppDI(compat);
                              }
                            }
                          }} style={{
                            padding: "6px 10px", background: sel === i ? col + "14" : T.panel,
                            border: `1px solid ${sel === i ? col : T.panelBorder}`, borderRadius: 2,
                            cursor: "pointer", color: sel === i ? col : T.textDim, fontFamily: FONT_UI,
                            fontSize: 8, fontWeight: 700, textAlign: "left",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            opacity: disabled ? 0.35 : 1, transition: "all .2s"
                          }}>
                            <span>{d.name}</span>
                            <span style={{ fontSize: 10, color: mag > 0 ? T.bless : mag < 0 ? T.curse : T.silver, opacity: 0.8 }}>
                              {mag > 0 ? "△" : mag < 0 ? "▽" : "✡"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={startGame} style={{
              padding: "6px 32px", background: "transparent", border: `1.5px solid ${T.silverBright}`, borderRadius: 2,
              cursor: "pointer", fontFamily: FONT_TITLE, fontSize: 16, color: T.white, letterSpacing: 4
            }}>Judgment</button>
          </div>
        )}

        {/* ═══ PLAY GAME — cards FILL cells ═══ */}
        {tab === "play" && game && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 6, height: "calc(100vh - 40px)", animation: "fadeIn .3s", overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
              {/* BOARD — cards fill cells */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(5,1fr)", gridTemplateRows: "repeat(5,1fr)", gap: 2, padding: 2,
                  background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3,
                  maxHeight: "100%", maxWidth: "100%", height: "100%", aspectRatio: "1/1"
                }}>
                  {game.bd.map((row, r) => row.map((cell, c) => {
                    const h = isH(r, c); const sel = selB && selB[0] === r && selB[1] === c;
                    const zone = r < 2 ? `${T.curse}06` : r > 2 ? `${T.bless}06` : "transparent";
                    return (
                      <div key={`${r}-${c}`} onClick={() => boardClick(r, c)} style={{
                        background: h ? T.gridCellHL : sel ? T.silver + "14" : T.gridCell,
                        border: `1px solid ${h ? T.silver + "55" : sel ? T.silver : T.panelBorder}`,
                        borderRadius: 2, cursor: h || cell?.ow === "player" ? "pointer" : "default",
                        display: "flex", alignItems: "stretch", justifyContent: "stretch",
                        transition: "all .1s", animation: h ? "glow 1.5s ease-in-out infinite" : cell?.fd ? "trapGlow 2s ease-in-out infinite" : "none",
                        backgroundImage: !cell ? `linear-gradient(135deg,${zone},transparent)` : "none",
                        overflow: "hidden", padding: 1, height: "100%", width: "100%"
                      }}>
                        {cell && <Card card={cell.cd} fill owner={cell.ow} sel={sel} fDown={cell.fd} noRar
                          effStats={cell.cd.type === "entity" && !cell.fd ? getEff(cell.cd, game.bd, r, c, cell.ib) : null} />}
                      </div>);
                  }))}
                </div>
              </div>
              {/* Player hand — horizontally scrollable */}
              <div style={{
                flexShrink: 0, minWidth: 0, overflow: "hidden",
                padding: "2px 6px", background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3
              }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontFamily: FONT_UI, fontSize: 6, color: T.textDim, fontWeight: 700 }}>YOU: {game.pD.length}d</span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 6, color: T.textDim, fontWeight: 700 }}>OPP: {game.aD.length}d</span>
                </div>
                <div style={{ display: "flex", gap: 4, overflowX: "auto", overflowY: "hidden", paddingBottom: 2 }}>
                  {game.pH.map((card, i) => (
                    <Card key={i} card={card} sz={78} sel={selH === i} noRar
                      onClick={() => game.turn === "player" && !aiR ? selectHand(i) : null} />
                  ))}
                </div>
              </div>
            </div>
            {/* Right panel — info top, controls bottom */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minHeight: 0 }}>
              {/* Top: turn info */}
              <div style={{ padding: 6, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, flexShrink: 0 }}>
                <div style={{ fontFamily: FONT_UI, fontSize: 10, color: T.textDim, letterSpacing: 3, fontWeight: 700 }}>TURN {game.tn}</div>
                <div style={{ fontFamily: FONT_UI, fontSize: 18, fontWeight: 900, color: game.turn === "player" ? T.silverBright : T.textDim, marginTop: 2 }}>
                  {game.ph === "over" ? (game.win === "player" ? "✦ VICTORY" : "▽ DEFEAT") : game.turn === "player" ? "Your Turn" : "Opponent..."}</div>
                {game.ph === "playing" && game.turn === "player" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {[0, 1, 2].map(i => (<div key={i} style={{
                      width: 16, height: 16, transform: "rotate(45deg)",
                      background: i < game.act ? T.silverBright : T.panelBorder, border: `1.5px solid ${i < game.act ? T.white : T.silverDim}`,
                      transition: "all .2s"
                    }} />))}
                  </div>)}
                <CDisp value={game.c} label={game.c === 0 ? "EXCESS" : game.c > 0 ? "ASCENSION" : "CORRUPTION"} />
              </div>
              {/* Inspect panel — shows when clicking a board cell */}
              {inspCell && game.bd[inspCell[0]]?.[inspCell[1]] && (() => {
                const ic = game.bd[inspCell[0]][inspCell[1]];
                const eff = ic.cd.type === "entity" ? getEff(ic.cd, game.bd, inspCell[0], inspCell[1], ic.ib) : null;
                return (
                  <div style={{ padding: 4, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, flexShrink: 0, animation: "fadeIn .2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 9, fontFamily: FONT_UI, fontWeight: 800, color: T.textBright }}>{ic.cd.name || ic.cd.type}</div>
                      <button onClick={() => setInspCell(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10 }}>x</button>
                    </div>
                    <div style={{ display: "flex", gap: 3, marginTop: 2, alignItems: "center" }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 3, border: `1px solid ${T.panelBorder}`, flexShrink: 0,
                        background: ic.cd.image ? `url(${ic.cd.image}) center/cover` : T.card
                      }} />
                      <div>
                        <div style={{ fontSize: 7, color: TC[ic.cd.type], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800 }}>{ic.cd.type} ({ic.ow === "player" ? "You" : "Opp"})</div>
                        {eff && <div style={{ display: "flex", gap: 4, marginTop: 1 }}>
                          {STAT_DEFS.map(s => {
                            const v = eff[s.key]; return (
                              <span key={s.key} style={{
                                fontSize: 10, fontFamily: FONT_UI, fontWeight: 900,
                                color: v > 0 ? s.color : v < 0 ? T.curse : T.textDim
                              }}>{s.label}{v > 0 ? "+" : ""}{v}</span>);
                          })}
                        </div>}
                        {(ic.cd.type === "blessing" || ic.cd.type === "curse") && <div style={{
                          fontSize: 9, fontFamily: FONT_UI, fontWeight: 900,
                          color: ic.cd.type === "blessing" ? T.bless : T.curse
                        }}>{ic.cd.type === "blessing" ? "+" : "-"}{cPwr(ic.cd)}C {ic.fd ? "(TRAP)" : ""}</div>}
                      </div>
                    </div>
                  </div>);
              })()}
              {/* Recent pit — last 3 cards */}
              {recentPit.length > 0 && (
                <div style={{ padding: 3, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, flexShrink: 0 }}>
                  <div style={{ fontSize: 6, fontFamily: FONT_UI, color: T.textDim, letterSpacing: 2, fontWeight: 700, marginBottom: 2 }}>RECENT</div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {recentPit.map((rp, i) => (
                      <div key={rp.t + i} style={{ textAlign: "center", animation: "fadeIn .3s" }}>
                        <Card card={rp.card} sz={32} noRar />
                        <div style={{ fontSize: 5, color: rp.owner === "player" ? T.silver : T.curse, fontFamily: FONT_UI, fontWeight: 700, marginTop: 1 }}>{rp.owner === "player" ? "YOU" : "OPP"}</div>
                      </div>))}
                  </div>
                </div>)}
              {/* Log */}
              <div ref={logRef} style={{ flex: 1, minHeight: 60, overflowY: "auto", padding: 4, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3 }}>
                {log.map((m, i) => (<div key={i} style={{ color: m.includes("⚔") ? "#a06070" : m.includes("✦") || m.includes("⟐") ? T.silverBright : m.includes("⚡") ? T.curse : T.textDim, lineHeight: 1.3, fontSize: 10 }}>{m}</div>))}
              </div>
              {/* Controls — at bottom */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                {game.ph === "playing" && game.turn === "player" && !aiR && (<>
                  {(mode === "blessing" || mode === "curse") && selH !== null && (<>
                    <button onClick={() => playBC(mode)} style={B(mode === "blessing" ? T.bless : T.curse)}>
                      {mode === "blessing" ? "△" : "▽"} Play ({game.c === 0 ? "FREE" : "1"})</button>
                    <button onClick={doSetTrap} style={B(T.silverDim)}>▼ Trap (FREE)</button></>)}
                  {mode === "chooseStat" && tapTgt && (
                    <div style={{ display: "flex", gap: 2 }}>
                      {STAT_DEFS.map(s => (<button key={s.key} onClick={() => resolveTap(s.key)} style={{
                        ...B(s.color), flex: 1, textTransform: "uppercase", letterSpacing: 2
                      }}>{s.label}</button>))}
                    </div>)}
                  <button onClick={drawCard} disabled={game.act <= 0 || !game.pD.length} style={B(T.entity, game.act <= 0)}>Draw ({game.pD.length})</button>
                  {mode && <button onClick={clr} style={B(T.textDim)}>Cancel</button>}
                  <button onClick={endTurn} style={{ ...B(T.silverBright), letterSpacing: 3, fontSize: 13, marginTop: 4 }}>END TURN</button>
                </>)}
                {game.ph === "over" && <button onClick={() => { setGame(null); setLog([]); }} style={{ ...B(T.silverBright), letterSpacing: 3 }}>NEW GAME</button>}
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button onClick={forfeit} style={{ ...B(T.danger), fontSize: 7, flex: 1 }}>Forfeit</button>
                  <button onClick={() => setShowPit(!showPit)} style={{ ...B(T.textDim), fontSize: 7, flex: 1 }}>Pit ({pit.player.length + pit.ai.length})</button>
                </div>
                {showPit && <div style={{ padding: 3, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, maxHeight: 80, overflowY: "auto", flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>{[...pit.player, ...pit.ai].map((c, i) => (<Card key={i} card={c} sz={24} noRar />))}</div>
                </div>}
              </div>
            </div>
          </div>
        )}

        {/* ═══ FORGE ═══ */}
        {tab === "create" && (
          <div style={{ animation: "fadeIn .3s" }}>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
              {[["single", "Single Card"], ["generate", "Set Generator"]].map(([m, l]) => (
                <button key={m} onClick={() => setForgeMode(m)} style={{
                  padding: "5px 14px", border: `1px solid ${forgeMode === m ? T.silverBright : T.panelBorder}`,
                  background: forgeMode === m ? T.silver + "12" : T.panel, borderRadius: 3, cursor: "pointer",
                  color: forgeMode === m ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 9, fontWeight: 700,
                }}>{l}</button>
              ))}
              <label style={{ marginLeft: "auto", padding: "5px 12px", border: `1px solid ${T.silverDim}`, borderRadius: 3, cursor: "pointer", fontFamily: FONT_UI, fontSize: 8, color: T.silver, fontWeight: 700 }}>
                Bulk Image Import<input type="file" accept="image/*" multiple onChange={handleBulk} style={{ display: "none" }} /></label>
            </div>

            {forgeMode === "single" ? (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, padding: 12, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 10 }}>
                    <label style={{
                      width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1.5px dashed ${T.panelBorder}`, borderRadius: 3, cursor: "pointer",
                      background: nc.image ? `url(${nc.image}) center/cover` : `linear-gradient(145deg,${nc.gradient[0]},${nc.gradient[1]})`,
                      fontSize: 18, color: T.textDim
                    }}>{!nc.image && "＋"}<input type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} /></label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} placeholder="Name..." style={{ ...INP, fontSize: 14, padding: "6px 10px" }} />
                      <input value={nc.set} onChange={e => setNc(p => ({ ...p, set: e.target.value }))} placeholder="Set..." style={{ ...INP, fontSize: 14, padding: "6px 10px" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                    {["entity", "blessing", "curse", "terrain", "equip"].map(t => (
                      <button key={t} onClick={() => setNc(p => ({ ...p, type: t, gradient: DG[t] || DG.entity }))} style={{
                        padding: "4px 10px", border: `1px solid ${nc.type === t ? TC[t] : T.panelBorder}`,
                        background: nc.type === t ? TC[t] + "15" : T.card, borderRadius: 2, color: nc.type === t ? TC[t] : T.textDim,
                        cursor: "pointer", fontFamily: FONT_UI, fontSize: 8, textTransform: "uppercase", fontWeight: 800
                      }}>{t}</button>))}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                      {RO.map(r => (<button key={r} onClick={() => setNc(p => ({ ...p, rarity: r }))} style={{
                        padding: "2px 8px", border: `1px solid ${nc.rarity === r ? RC[r] : T.panelBorder}`, background: nc.rarity === r ? RC[r] + "10" : T.card, borderRadius: 2,
                        color: nc.rarity === r ? RC[r] : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, textTransform: "uppercase", fontWeight: 800
                      }}>{r[0]}</button>))}
                    </div>
                  </div>
                  {["entity", "terrain", "equip"].includes(nc.type) && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                      {STAT_DEFS.map(s => (<div key={s.key} style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: s.color, fontFamily: FONT_UI, fontWeight: 800 }}>{s.label}</span>
                          <span style={{ fontSize: 11, color: s.color, fontFamily: FONT_UI, fontWeight: 900 }}>{nc[s.key] > 0 ? "+" : ""}{nc[s.key]}</span></div>
                        <input type="range" min={STAT_MIN} max={STAT_MAX} value={nc[s.key]} onChange={e => setNc(p => ({ ...p, [s.key]: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: s.color }} />
                      </div>))}
                    </div>)}
                  {(nc.type === "blessing" || nc.type === "curse") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input type="range" min="1" max="3" value={nc.power} onChange={e => setNc(p => ({ ...p, power: parseInt(e.target.value) }))} style={{ width: 120, accentColor: nc.type === "blessing" ? T.bless : T.curse }} />
                      <span style={{ fontSize: 14, color: nc.type === "blessing" ? T.bless : T.curse, fontFamily: FONT_UI, fontWeight: 900 }}>{nc.type === "blessing" ? "+" : "−"}{nc.power}C</span>
                    </div>)}
                  <button onClick={createCard} style={{ ...B(T.silverBright), letterSpacing: 3, fontSize: 11, width: "100%", padding: "6px 10px" }}>FORGE CARD</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 200 }}>
                  <Card card={{ ...nc, id: "preview" }} sz={180} />
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: FONT_UI }}>{cardPool.length} cards</div>
                </div>
              </div>
            ) : (
              /* SET GENERATOR */
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", height: "calc(100vh - 120px)" }}>
                <div style={{ width: 360, flexShrink: 0, padding: 12, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, overflowY: "auto", maxHeight: "100%" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, marginBottom: 12 }}>
                    <div><label style={LBL}>SET NAME</label>
                      <input value={gen.name} onChange={e => setGen(p => ({ ...p, name: e.target.value }))} style={{ ...INP, fontSize: 14, padding: "6px 10px" }} /></div>
                    <div><label style={LBL}>TOTAL CARDS</label>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginTop: 4 }}>
                        <input type="range" min="10" max="2000" value={gen.total} onChange={e => setGen(p => ({ ...p, total: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: T.silver }} />
                        <span style={{ fontFamily: FONT_UI, fontSize: 13, color: T.silverBright, fontWeight: 900, marginTop: 2 }}>{gen.total}</span>
                      </div></div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={LBL}>TYPE DISTRIBUTION</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 4 }}>
                      {[["Entity", "pctEntity", TC.entity], ["Bless", "pctBless", TC.blessing], ["Curse", "pctCurse", TC.curse], ["Terrain", "pctTerrain", TC.terrain], ["Equip", "pctItem", TC.item]].map(([label, key, color]) => (
                        <div key={key} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 8, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                          <input type="range" min="0" max="100" value={gen[key]} onChange={e => setGen(p => ({ ...p, [key]: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: color }} />
                          <div style={{ fontSize: 11, color, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[key]}%</div>
                          <div style={{ fontSize: 8, color: T.textDim }}>≈{Math.round(gen.total * gen[key] / 100)}</div>
                        </div>))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={LBL}>ENTITY POWER BUDGET (|S|+|M|+|W|)</label>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      {[["Min", "powerMin"], ["Max", "powerMax"]].map(([label, key]) => (
                        <div key={key} style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 8, color: T.textDim, fontFamily: FONT_UI }}>{label}</span>
                            <span style={{ fontSize: 11, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[key]}</span></div>
                          <input type="range" min="0" max="9" value={gen[key]} onChange={e => setGen(p => {
                            const v = parseInt(e.target.value);
                            return key === "powerMin" ? { ...p, powerMin: Math.min(v, p.powerMax) } : { ...p, powerMax: Math.max(v, p.powerMin) };
                          })} style={{ width: "100%", accentColor: T.silver }} />
                        </div>))}
                    </div>
                    <div style={{ fontSize: 8, color: T.textDim, marginTop: 2 }}>3–4 = commons. 5–6 = mid-range. 7–9 = powerhouse.</div>
                  </div>
                  {/* Blessing / Curse power ranges */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    {[["Blessing Pwr", "blessPwrMin", "blessPwrMax", TC.blessing], ["Curse Pwr", "cursePwrMin", "cursePwrMax", TC.curse]].map(([label, minK, maxK, color]) => (
                      <div key={label}>
                        <label style={{ ...LBL, color }}>{label}</label>
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          {[[minK, "Min"], [maxK, "Max"]].map(([k, lb]) => (
                            <div key={k} style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 7, color: T.textDim }}>{lb}</span>
                                <span style={{ fontSize: 10, color, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[k]}</span></div>
                              <input type="range" min="1" max="5" value={gen[k]} onChange={e => {
                                const v = parseInt(e.target.value);
                                setGen(p => k.includes("Min") ? { ...p, [k]: Math.min(v, p[maxK]) } : { ...p, [k]: Math.max(v, p[minK]) });
                              }} style={{ width: "100%", accentColor: color }} />
                            </div>))}
                        </div>
                      </div>))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={LBL}>RARITY DISTRIBUTION</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 4 }}>
                      {[["Common", "rarCommon", RC.common], ["Uncommon", "rarUncommon", RC.uncommon], ["Rare", "rarRare", RC.rare], ["Legend", "rarLegendary", RC.legendary]].map(([label, key, color]) => (
                        <div key={key} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                          <input type="range" min="0" max="100" value={gen[key]} onChange={e => setGen(p => ({ ...p, [key]: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: color }} />
                          <div style={{ fontSize: 10, color, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[key]}%</div>
                        </div>))}
                    </div>
                  </div>
                  {/* Generation mode */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={LBL}>GENERATION MODE</label>
                    <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                      {[["permute", "All Permutations"], ["random", "Random (rarity→power)"]].map(([m, l]) => (
                        <button key={m} onClick={() => setGenMode(m)} style={{
                          flex: 1, padding: "5px 8px", border: `1px solid ${genMode === m ? T.silverBright : T.panelBorder}`,
                          background: genMode === m ? T.silver + "12" : T.bg2, borderRadius: 3, cursor: "pointer",
                          color: genMode === m ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 8, fontWeight: 700,
                        }}>{l}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 8, color: T.textDim, marginTop: 3 }}>
                      {genMode === "random"
                        ? "Common = low power, Legendary = high power. Random stats within budget."
                        : `Cycles through all S/M/W combos where |S|+|M|+|W| is ${gen.powerMin}–${gen.powerMax}. Specific distributions depending on types.`}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 8, fontSize: 9, color: T.textBright, fontFamily: FONT_UI }}>
                      <input type="checkbox" checked={gen.ensureTypes || false} onChange={e => setGen(p => ({ ...p, ensureTypes: e.target.checked }))} style={{ accentColor: T.silverBright }} />
                      GUARANTEE AT LEAST 1 OF EACH TYPE PER RARITY
                    </label>
                  </div>
                  <button onClick={() => { generateSet(); setGen(p => ({ ...p, name: "New Set " + (sets.length + 1) })); }}
                    style={{ ...B(T.silverBright), letterSpacing: 4, fontSize: 13, width: "100%", padding: "8px 16px", marginBottom: 8 }}>
                    GENERATE {gen.total} CARDS → "{gen.name}"
                  </button>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, height: "100%" }}>
                  {/* Live preview table — updates as you drag sliders */}
                  <div style={{ padding: 8, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, flex: 1, overflowY: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <label style={LBL}>PREVIEW ({livePreview.length} cards)</label>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <label style={{ ...B(T.silverDim), fontSize: 7, padding: "3px 8px", cursor: "pointer" }}>
                        Random Assign Images<input type="file" accept="image/*" multiple onChange={async (e) => {
                          const files = Array.from(e.target.files);
                          if (!files.length) return;
                          for (let fi = 0; fi < files.length; fi++) {
                            const path = await uploadFile(files[fi]);
                            if (path) {
                              setGenImages(prev => {
                                const n = { ...prev };
                                for (let ri = fi; ri < livePreview.length; ri += files.length) {
                                  n[ri] = path;
                                }
                                return n;
                              });
                            }
                          }
                          e.target.value = "";
                        }} style={{ display: "none" }} />
                      </label>
                      {Object.keys(genImages).length > 0 && <button onClick={() => setGenImages({})} style={{ ...B(T.textDim), fontSize: 7, padding: "3px 8px" }}>Clear Art</button>}
                      <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI }}>
                        {["entity", "blessing", "curse", "terrain", "equip"].map(t => {
                          const n = livePreview.filter(c => c.type === t).length;
                          return n ? <span key={t} style={{ color: TC[t] || T.text, marginLeft: 6 }}>{n} {t.slice(0, 3)}</span> : null;
                        })}
                      </div>
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, fontFamily: FONT_UI }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.panelBorder}`, position: "sticky", top: 0, background: T.panel }}>
                        {["#", "Art", "Type", "S", "M", "W", "|Pwr|", "Aura", "Rar", "C Pwr"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "2px 4px", color: T.textDim, fontWeight: 700, fontSize: 7, letterSpacing: 1 }}>{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {livePreview.map((c, i) => {
                        const pwr = Math.abs(c.soul) + Math.abs(c.mind) + Math.abs(c.will);
                        const au = c.soul + c.mind + c.will;
                        const ori = au > 0 ? "△" : au < 0 ? "▽" : pwr > 0 ? "✡" : "";
                        const img = genImages[i];
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${T.panelBorder}15` }}>
                            <td style={{ padding: "1px 4px", color: T.textDim }}>{i + 1}</td>
                            <td style={{ padding: "1px 2px" }}>
                              <label
                                draggable={!!img}
                                onDragStart={() => { dragRef.current = i; }}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => { e.preventDefault(); const from = dragRef.current; if (from !== null && from !== i) { setGenImages(prev => { const n = { ...prev }; const tmp = n[from]; n[from] = n[i]; n[i] = tmp; return n; }); } dragRef.current = null; }}
                                style={{
                                  width: 20, height: 20, display: "block", borderRadius: 2, cursor: img ? "grab" : "pointer",
                                  background: img ? `url(${img}) center/cover` : T.bg2,
                                  border: `1px solid ${img ? T.silverDim : T.panelBorder}`
                                }}
                              >
                                {!img && <span style={{ fontSize: 8, color: T.textDim, lineHeight: "20px", textAlign: "center", display: "block" }}>+</span>}
                                <input type="file" accept="image/*" onChange={async (e) => {
                                  const f = e.target.files[0]; if (!f) return;
                                  const path = await uploadFile(f);
                                  if (path) setGenImages(prev => ({ ...prev, [i]: path }));
                                  e.target.value = "";
                                }} style={{ display: "none" }} />
                              </label>
                            </td>
                            <td style={{ padding: "1px 4px", color: TC[c.type] || T.text }}>{c.type.slice(0, 3)}</td>
                            <td style={{ padding: "1px 4px", color: c.soul > 0 ? STAT_DEFS[0].color : c.soul < 0 ? T.curse : T.textDim }}>{c.soul || "·"}</td>
                            <td style={{ padding: "1px 4px", color: c.mind > 0 ? STAT_DEFS[1].color : c.mind < 0 ? T.curse : T.textDim }}>{c.mind || "·"}</td>
                            <td style={{ padding: "1px 4px", color: c.will > 0 ? STAT_DEFS[2].color : c.will < 0 ? T.curse : T.textDim }}>{c.will || "·"}</td>
                            <td style={{ padding: "1px 4px", color: T.silverBright, fontWeight: 800 }}>{pwr || "·"}</td>
                            <td style={{ padding: "1px 4px", color: au > 0 ? T.light : au < 0 ? T.dark : T.balanced }}>{ori}{au || ""}</td>
                            <td style={{ padding: "1px 4px", color: RC[c.rarity] }}>{c.rarity?.[0]?.toUpperCase()}</td>
                            <td style={{ padding: "1px 4px", color: c.power ? (c.type === "blessing" ? TC.blessing : TC.curse) : T.textDim }}>{c.power || "·"}</td>
                          </tr>);
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Existing sets */}
                <div style={{ padding: 8, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: T.textBright, fontFamily: FONT_UI, fontWeight: 800, letterSpacing: 1, alignSelf: "center", marginRight: 4 }}>EXISTING SETS</div>
                  {sets.map(s => (
                    <div key={s.id} style={{ padding: "3px 8px", background: T.bg1, border: `1px solid ${T.panelBorder}`, borderRadius: 3, fontSize: 8, color: T.textDim, fontFamily: FONT_UI }}>
                      <span style={{ color: T.textBright, fontWeight: 700 }}>{s.name}</span> · {s.cardIds.length}
                    </div>))}
                </div>
              </div>
            </div>
            )}
          </div>)}

        {/* ═══ DECKS ═══ */}
        {tab === "decks" && (
          <div style={{ animation: "fadeIn .3s" }}>
            {!editDeck ? (<>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>DECKS</h2>
                <button onClick={() => { setDecks(p => [...p, { name: "New Deck", cards: [] }]); setEditDeck({ idx: decks.length }); }} style={B(T.silverBright)}>+ New</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 5 }}>
                {decks.map((d, i) => (<div key={i} onClick={() => setEditDeck({ idx: i })} style={{ padding: 6, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, cursor: "pointer" }}>
                  <div style={{ fontFamily: FONT_UI, fontSize: 9, color: T.textBright, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 8, color: T.textDim }}>{d.cards.length}/{DECK_SIZE}</div></div>))}</div></>
            ) : (<>
              <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 5 }}>
                <button onClick={() => setEditDeck(null)} style={B(T.textDim)}>←</button>
                <input value={decks[editDeck.idx]?.name || ""} onChange={e => { const u = [...decks]; u[editDeck.idx] = { ...u[editDeck.idx], name: e.target.value }; setDecks(u); }}
                  style={{ ...INP, fontFamily: FONT_UI, fontSize: 10, flex: 1, fontWeight: 700 }} />
                <span style={{ fontSize: 8, color: T.textDim, fontWeight: 700 }}>{decks[editDeck.idx]?.cards.length}/{DECK_SIZE}</span>
                <div style={{ display: "flex", gap: 2 }}>
                  <button onClick={() => setDeckSortMode("type")} style={{ padding: "3px 8px", border: `1px solid ${deckSortMode === "type" ? T.silverBright : T.panelBorder}`, background: deckSortMode === "type" ? T.silver + "15" : T.panel, borderRadius: 2, cursor: "pointer", color: deckSortMode === "type" ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 7, fontWeight: 800, textTransform: "uppercase" }}>Type Sort</button>
                  <button onClick={() => setDeckSortMode("rarity")} style={{ padding: "3px 8px", border: `1px solid ${deckSortMode === "rarity" ? T.silverBright : T.panelBorder}`, background: deckSortMode === "rarity" ? T.silver + "15" : T.panel, borderRadius: 2, cursor: "pointer", color: deckSortMode === "rarity" ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 7, fontWeight: 800, textTransform: "uppercase" }}>Rarity Sort</button>
                </div>
              </div>
              {(() => {
                const sortCards = (cardsArray) => {
                  const tOrder = { entity: 1, terrain: 2, equip: 3, blessing: 4, curse: 5 };
                  return [...cardsArray].sort((a, b) => {
                    if (deckSortMode === "rarity" && a.rarity !== b.rarity) return RO.indexOf(b.rarity) - RO.indexOf(a.rarity);
                    if (tOrder[a.type] !== tOrder[b.type]) return (tOrder[a.type] || 99) - (tOrder[b.type] || 99);
                    const pA = cPwr(a), pB = cPwr(b);
                    if (pA !== pB) return pB - pA;
                    return a.id.localeCompare(b.id);
                  });
                };
                const ownedCards = sortCards(cardPool.filter(c => owned(c.id) > 0));
                const deckCards = sortCards((decks[editDeck.idx]?.cards || []).map(id => gc(id, cardPool)).filter(Boolean));
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {["OWNED", "DECK"].map((label, ci) => (
                      <div key={label} style={{ background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, padding: 8 }}>
                        <div style={{ ...LBL, marginBottom: 4, fontSize: 8 }}>{label}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 520, overflowY: "auto" }}>
                          {ci === 0 ? ownedCards.map(card => {
                            const inDk = decks[editDeck.idx]?.cards.filter(id => id === card.id).length || 0;
                            const avail = owned(card.id) - inDk;
                            return (<div key={card.id} style={{ position: "relative" }}>
                              <Card card={card} sz={72} dim={avail <= 0} onClick={() => {
                                if (avail <= 0) return; const dk = decks[editDeck.idx];
                                if (dk.cards.length >= DECK_SIZE || inDk >= MAX_COPIES) return;
                                const u = [...decks]; u[editDeck.idx] = { ...dk, cards: [...dk.cards, card.id] }; setDecks(u);
                              }} />
                              <div style={{
                                position: "absolute", top: -3, right: -3, minWidth: 14, height: 14, background: avail > 0 ? T.silverBright : T.danger, borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#000", fontWeight: 800
                              }}>{avail}</div>
                            </div>);
                          })
                            : deckCards.map((card, i) => (
                                <Card key={`${card.id}_${i}`} card={card} sz={72} onClick={() => {
                                  const u = [...decks]; const cards = [...u[editDeck.idx].cards];
                                  const origIdx = cards.indexOf(card.id);
                                  if (origIdx !== -1) cards.splice(origIdx, 1);
                                  u[editDeck.idx] = { ...u[editDeck.idx], cards }; setDecks(u);
                                }} />
                              ))}
                        </div></div>))}
                  </div>
                );
              })()}</>)}
          </div>)}

        {/* ═══ CODEX ═══ */}
        {tab === "browse" && (
          <div style={{ animation: "fadeIn .3s" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>CODEX</h2>
              <div style={{ marginLeft: "auto", display: "flex", gap: 1 }}>
                {["all", "entity", "blessing", "curse", "terrain", "equip"].map(f => (
                  <button key={f} onClick={() => setBF(f)} style={{
                    padding: "1px 5px", border: `1px solid ${bF === f ? (TC[f] || T.silver) : T.panelBorder}`,
                    background: bF === f ? (TC[f] || T.silver) + "10" : "transparent", borderRadius: 2,
                    color: bF === f ? (TC[f] || T.silver) : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, textTransform: "uppercase", fontWeight: 800
                  }}>{f}</button>))}</div></div>
            <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
              <button onClick={() => setBSetF("all")} style={{
                padding: "1px 5px", border: `1px solid ${bSetF === "all" ? T.silver : T.panelBorder}`,
                background: bSetF === "all" ? T.silver + "10" : "transparent", borderRadius: 2, color: bSetF === "all" ? T.silver : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700
              }}>All</button>
              {sets.map(s => (<button key={s.id} onClick={() => setBSetF(s.name)} style={{
                padding: "1px 5px", border: `1px solid ${bSetF === s.name ? T.silver : T.panelBorder}`,
                background: bSetF === s.name ? T.silver + "10" : "transparent", borderRadius: 2, color: bSetF === s.name ? T.silver : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700
              }}>{s.name}</button>))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: bDet ? "1fr 220px" : "1fr", gap: 6 }}>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {cardPool.filter(c => (bF === "all" || c.type === bF) && (bSetF === "all" || sets.some(s => s.name === bSetF && s.cardIds.includes(c.id)))).map(card => {
                  const isMasked = !owned(card.id) && card.rarity === "legendary";
                  return (
                    <div key={card.id} style={{ position: "relative" }}>
                      <Card card={card} sz={70} onClick={isMasked ? undefined : () => { setBDet(card); setEditN(null); }} sel={bDet?.id === card.id} notOwned={!owned(card.id)} mask={!owned(card.id)} />
                      {owned(card.id) > 0 && <div style={{
                        position: "absolute", top: -2, right: -2, minWidth: 10, height: 10, background: T.silverBright, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, color: "#000", fontWeight: 800
                      }}>{owned(card.id)}</div>}
                    </div>);
                })}</div>
              {bDet && (
                <div style={{ padding: 6, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, position: "sticky", top: 6, alignSelf: "start" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><Card card={bDet} sz={110} />
                    <button onClick={() => setBDet(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 11 }}>✕</button></div>
                  <div style={{ marginTop: 4 }}>
                    {editN === bDet.id ? (<input autoFocus value={bDet.name || ""} onChange={e => { updateCard(bDet.id, { name: e.target.value }); setBDet(p => ({ ...p, name: e.target.value })); }}
                      onBlur={() => setEditN(null)} onKeyDown={e => e.key === "Enter" && setEditN(null)} style={{ ...INP, fontFamily: FONT_UI, fontSize: 11, fontWeight: 800 }} />
                    ) : (<h3 onClick={() => setEditN(bDet.id)} style={{
                      fontFamily: FONT_UI, fontSize: 11, color: bDet.name ? T.textBright : T.textDim,
                      margin: 0, fontWeight: 800, cursor: "pointer", borderBottom: `1px dashed ${T.panelBorder}`
                    }}>{bDet.name || "Click to name..."}</h3>)}</div>
                  <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                    <span style={{ fontSize: 7, color: TC[bDet.type], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800 }}>{bDet.type}</span>
                    <span style={{ fontSize: 7, color: RC[bDet.rarity], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800 }}>{bDet.rarity}</span>
                    <span style={{ fontSize: 7, color: T.textDim }}>×{owned(bDet.id)}</span></div>
                  {bDet.type === "entity" && (<>
                    <div style={{ marginTop: 3, display: "flex", gap: 6 }}>
                      {STAT_DEFS.map(s => (<div key={s.key} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontFamily: FONT_UI, fontWeight: 900, color: s.color }}>{(bDet[s.key] || 0) > 0 ? "+" : ""}{bDet[s.key] || 0}</div>
                        <div style={{ fontSize: 6, color: T.textDim, fontWeight: 700 }}>{s.label}</div></div>))}</div>
                    <div style={{ fontSize: 7, color: oCol(orient(bDet)), fontFamily: FONT_UI, fontWeight: 700 }}>
                      {orient(bDet) === "balanced" ? "✡ Transcendent" : orient(bDet)} · aura {aura(bDet)}</div></>)}
                  <div style={{ marginTop: 4, padding: 3, background: T.bg2, borderRadius: 2 }}>
                    <div style={{ ...LBL, marginBottom: 2 }}>IN SETS</div>
                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {sets.map((s, i) => {
                        return (<button key={i} onClick={() => togSet(i, bDet.id)} style={{
                          padding: "1px 4px",
                          border: `1px solid ${s.cardIds.includes(bDet.id) ? T.silverBright : T.panelBorder}`,
                          background: s.cardIds.includes(bDet.id) ? T.silverBright + "15" : "transparent", borderRadius: 2,
                          color: s.cardIds.includes(bDet.id) ? T.silverBright : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700,
                          display: "inline-flex", alignItems: "center", gap: 2
                        }}>
                          {s.name}</button>);
                      })}</div></div>
                </div>)}
            </div></div>)}

        {/* ═══ PACKS — no rarity sliders, just pick set & rip ═══ */}
        {tab === "packs" && (
          <div style={{ animation: "fadeIn .3s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>PACKS</h2>
              <div style={{ fontFamily: FONT_UI, fontSize: 10, color: tokens >= PACK_COST ? T.silverBright : T.curse, fontWeight: 800 }}>{tokens} TOKENS</div>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {sets.map((s, i) => {
                return (<button key={s.id} onClick={() => { setSelSI(i); setPackRes([]); }} style={{
                  padding: "5px 14px", border: `1px solid ${selSI === i ? T.silverBright : T.panelBorder}`,
                  background: selSI === i ? T.silver + "12" : T.panel, borderRadius: 3, cursor: "pointer",
                  color: selSI === i ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 9, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 4
                }}>
                  {s.name} <span style={{ fontSize: 7, opacity: 0.6 }}>({s.cardIds.length})</span></button>);
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              {!packRes.length ? (
                <button onClick={() => sets[selSI] && ripPack(sets[selSI])} disabled={tokens < PACK_COST} style={{
                  padding: "10px 40px", background: "transparent", border: `1.5px solid ${tokens >= PACK_COST ? T.silverBright : T.panelBorder}`, borderRadius: 3,
                  cursor: tokens >= PACK_COST ? "pointer" : "not-allowed", fontFamily: FONT_TITLE, fontSize: 18, color: tokens >= PACK_COST ? T.white : T.textDim, letterSpacing: 4
                }}>{tokens >= PACK_COST ? "Open Pack" : "Locked (1 Token)"}</button>
              ) : (<>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {packRes.map((card, i) => {
                    const rarShimmer = {
                      common: "shimmerCommon 2s ease-in-out infinite", uncommon: "shimmerUncommon 1.8s ease-in-out infinite",
                      rare: "shimmerRare 1.5s ease-in-out infinite", legendary: "shimmerLegendary 2s ease-in-out infinite"
                    };
                    return (<div key={i} onClick={() => {
                      setPackFlip(p => { const n = [...p]; n[i] = true; return n; });
                      if (card.rarity === "rare" || card.rarity === "legendary") setTimeout(() => setPackSp(p => { const n = [...p]; n[i] = true; return n; }), 100);
                    }}
                      style={{ cursor: "pointer", animation: packFlip[i] ? `packPop .4s ease-out ${i * .12}s both` : "none" }}>
                      {packFlip[i] ? (
                        <div style={{ textAlign: "center", animation: rarShimmer[card.rarity] || "none", borderRadius: 4, padding: 2 }}>
                          <Card card={card} sz={140} sparkle={packSp[i]} />
                          <div style={{
                            fontSize: 9, color: RC[card.rarity], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800, marginTop: 3, letterSpacing: 2,
                            textShadow: card.rarity === "legendary" ? `0 0 12px ${T.legendary}aa` : card.rarity === "rare" ? `0 0 8px ${T.silverBright}44` : "none"
                          }}>{card.rarity}</div></div>
                      ) : (
                        <div style={{
                          width: 140, height: 140 + 20, borderRadius: 3, border: `1.5px solid ${T.silverDim}22`,
                          background: T.card,
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          <span style={{ fontFamily: FONT_TITLE, fontSize: 42, color: T.silverBright, lineHeight: 1 }}>T</span></div>)}
                    </div>);
                  })}</div>
                <button onClick={() => { setPackRes([]); setPackFlip([]); setPackSp([]); }} style={{ ...B(T.silverBright), letterSpacing: 3, fontSize: 10 }}>Open Another</button>
              </>)}
            </div></div>)}

        {/* ═══ EDITOR — filterable, sortable, with image upload ═══ */}
        {tab === "editor" && (() => {
          const sortFns = {
            id: (a, b) => a.id.localeCompare(b.id),
            name: (a, b) => (a.name || "").localeCompare(b.name || ""),
            type: (a, b) => a.type.localeCompare(b.type),
            rarity: (a, b) => RO.indexOf(a.rarity) - RO.indexOf(b.rarity),
            power: (a, b) => cPwr(b) - cPwr(a),
            noart: (a, b) => (a.image ? 1 : 0) - (b.image ? 1 : 0),
          };
          const filtered = cardPool
            .filter(c => edF.set === "all" || sets.some(s => s.name === edF.set && s.cardIds.includes(c.id)))
            .filter(c => edF.type === "all" || c.type === edF.type)
            .filter(c => edF.rarity === "all" || c.rarity === edF.rarity)
            .filter(c => edF.art === "all" || (edF.art === "noart" ? !c.image : !!c.image))
            .sort(sortFns[edF.sort] || sortFns.id);
          return (
            <div style={{ animation: "fadeIn .3s" }}>
              {/* Filter bar */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>EDITOR</h2>
                <span style={{ fontSize: 8, color: T.textDim }}>({filtered.length}/{cardPool.length})</span>
                <div style={{ marginLeft: "auto" }} />
                {/* Set filter */}
                <select value={edF.set} onChange={e => setEdF(p => ({ ...p, set: e.target.value }))}
                  style={{ ...INP, width: "auto", fontSize: 9, padding: "2px 6px", fontFamily: FONT_UI }}>
                  <option value="all">All Sets</option>
                  {sets.map(s => <option key={s.id} value={s.name}>{s.name} ({s.cardIds.length})</option>)}
                </select>
                {/* Type filter */}
                <div style={{ display: "flex", gap: 1 }}>
                  {["all", "entity", "blessing", "curse", "terrain", "equip"].map(t => (
                    <button key={t} onClick={() => setEdF(p => ({ ...p, type: t }))} style={{
                      padding: "1px 5px", border: `1px solid ${edF.type === t ? (TC[t] || T.silver) : T.panelBorder}`,
                      background: edF.type === t ? (TC[t] || T.silver) + "10" : "transparent", borderRadius: 2,
                      color: edF.type === t ? (TC[t] || T.silver) : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, textTransform: "uppercase", fontWeight: 800,
                    }}>{t === "all" ? "All" : t.slice(0, 3)}</button>))}
                </div>
                {/* Rarity filter */}
                <div style={{ display: "flex", gap: 1 }}>
                  <button onClick={() => setEdF(p => ({ ...p, rarity: "all" }))} style={{
                    padding: "1px 4px", border: `1px solid ${edF.rarity === "all" ? T.silver : T.panelBorder}`,
                    background: edF.rarity === "all" ? T.silver + "10" : "transparent", borderRadius: 2,
                    color: edF.rarity === "all" ? T.silver : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700,
                  }}>★</button>
                  {RO.map(r => (
                    <button key={r} onClick={() => setEdF(p => ({ ...p, rarity: r }))} style={{
                      padding: "1px 4px", border: `1px solid ${edF.rarity === r ? RC[r] : T.panelBorder}`,
                      background: edF.rarity === r ? RC[r] + "10" : "transparent", borderRadius: 2,
                      color: edF.rarity === r ? RC[r] : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700,
                    }}>{r[0].toUpperCase()}</button>))}
                </div>
                {/* Art filter */}
                <button onClick={() => setEdF(p => ({ ...p, art: p.art === "noart" ? "all" : "noart" }))} style={{
                  padding: "1px 6px", border: `1px solid ${edF.art === "noart" ? T.curse : T.panelBorder}`,
                  background: edF.art === "noart" ? T.curse + "15" : "transparent", borderRadius: 2,
                  color: edF.art === "noart" ? T.curse : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 800,
                }}>No Art</button>
                {/* Sort */}
                <select value={edF.sort} onChange={e => setEdF(p => ({ ...p, sort: e.target.value }))}
                  style={{ ...INP, width: "auto", fontSize: 9, padding: "2px 6px", fontFamily: FONT_UI }}>
                  <option value="id">Sort: ID</option>
                  <option value="name">Sort: Name</option>
                  <option value="type">Sort: Type</option>
                  <option value="rarity">Sort: Rarity</option>
                  <option value="power">Sort: Power</option>
                  <option value="noart">Sort: No Art First</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: editCard ? "1fr 300px" : "1fr", gap: 8 }}>
                {/* Card grid — drag images onto cards to assign art */}
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignContent: "start", maxHeight: "calc(100vh - 110px)", overflowY: "auto", padding: 2 }}
                  onDragOver={e => e.preventDefault()}>
                  {filtered.map(card => (
                    <div key={card.id} style={{ position: "relative" }}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px solid ${T.silverBright}`; }}
                      onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
                      onDrop={e => {
                        e.preventDefault(); e.currentTarget.style.outline = "none";
                        const files = e.dataTransfer.files;
                        if (files.length && files[0].type.startsWith("image/")) {
                          uploadFile(files[0]).then(path => {
                            if (path) updateCard(card.id, { image: path });
                          });
                        }
                      }}>
                      <Card card={card} sz={70} onClick={() => setEditCard(card)} sel={editCard?.id === card.id} />
                      {!card.image && <div style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: "50%", background: T.curse }} />}
                    </div>))}
                  {!filtered.length && <div style={{ fontSize: 10, color: T.textDim, padding: 12 }}>No cards match filters.</div>}
                </div>

                {/* Card detail panel */}
                {editCard && (() => {
                  const c = cardPool.find(x => x.id === editCard.id) || editCard;
                  const upd = (field, val) => { updateCard(c.id, { [field]: val }); setEditCard(prev => ({ ...prev, [field]: val })); };
                  const handleEdImg = async (e) => {
                    const f = e.target.files[0]; if (!f) return;
                    const path = await uploadFile(f);
                    if (path) upd("image", path);
                  };
                  const handleEdVid = async (e) => {
                    const f = e.target.files[0]; if (!f) return;
                    const path = await uploadFile(f, "video");
                    if (path) upd("video", path);
                  };
                  return (
                    <div style={{ padding: 10, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, position: "sticky", top: 6, alignSelf: "start", maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px solid ${T.silverBright}`; }}
                          onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
                          onDrop={e => {
                            e.preventDefault(); e.currentTarget.style.outline = "none";
                            const files = e.dataTransfer.files;
                            if (files.length && files[0].type.startsWith("image/")) { uploadFile(files[0]).then(p => p && upd("image", p)); }
                            else if (files.length && files[0].type.startsWith("video/")) { uploadFile(files[0], "video").then(p => p && upd("video", p)); }
                          }} style={{ borderRadius: 4 }}>
                          <Card card={c} sz={140} />
                          {!c.image && <div style={{ fontSize: 7, color: T.textDim, textAlign: "center", marginTop: 2 }}>drop image here</div>}
                        </div>
                        <button onClick={() => setEditCard(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 14, alignSelf: "start" }}>✕</button>
                      </div>

                      {/* Image + Video upload */}
                      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                        <label style={{ flex: 1, ...B(c.image ? T.entity : T.curse), textAlign: "center", cursor: "pointer", fontSize: 9 }}>
                          {c.image ? "Change Art" : "+ Add Art"}
                          <input type="file" accept="image/*" onChange={handleEdImg} style={{ display: "none" }} />
                        </label>
                        <label style={{ flex: 1, ...B(c.video ? T.entity : T.textDim), textAlign: "center", cursor: "pointer", fontSize: 9 }}>
                          {c.video ? "Change Video" : "+ Video"}
                          <input type="file" accept="video/*" onChange={handleEdVid} style={{ display: "none" }} />
                        </label>
                        {c.image && <button onClick={() => upd("image", null)} style={{ ...B(T.danger), fontSize: 7, padding: "2px 6px" }}>x</button>}
                      </div>

                      <div style={{ marginBottom: 4 }}><label style={LBL}>NAME</label>
                        <input value={c.name || ""} onChange={e => upd("name", e.target.value)} placeholder="Unnamed..." style={INP} /></div>
                      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                        {["entity", "blessing", "curse", "terrain", "equip"].map(t => (
                          <button key={t} onClick={() => upd("type", t)} style={{
                            padding: "2px 6px", border: `1px solid ${c.type === t ? TC[t] : T.panelBorder}`,
                            background: c.type === t ? TC[t] + "15" : T.card, borderRadius: 2, color: c.type === t ? TC[t] : T.textDim,
                            cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, textTransform: "uppercase", fontWeight: 800
                          }}>{t}</button>))}</div>
                      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                        {RO.map(r => (
                          <button key={r} onClick={() => upd("rarity", r)} style={{
                            padding: "2px 6px", border: `1px solid ${c.rarity === r ? RC[r] : T.panelBorder}`,
                            background: c.rarity === r ? RC[r] + "10" : T.card, borderRadius: 2, color: c.rarity === r ? RC[r] : T.textDim,
                            cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, textTransform: "uppercase", fontWeight: 800
                          }}>{r}</button>))}</div>
                      <div style={{ marginBottom: 4 }}>
                        {STAT_DEFS.map(s => (
                          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                            <span style={{ fontSize: 9, color: s.color, fontFamily: FONT_UI, fontWeight: 800, width: 16 }}>{s.label}</span>
                            <input type="range" min={STAT_MIN} max={STAT_MAX} value={c[s.key] || 0}
                              onChange={e => upd(s.key, parseInt(e.target.value))} style={{ flex: 1, accentColor: s.color }} />
                            <span style={{ fontSize: 11, color: s.color, fontFamily: FONT_UI, fontWeight: 900, width: 24, textAlign: "right" }}>
                              {(c[s.key] || 0) > 0 ? "+" : ""}{c[s.key] || 0}</span></div>))}</div>
                      {(c.type === "blessing" || c.type === "curse") && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                          <span style={{ fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, width: 30 }}>PWR</span>
                          <input type="range" min="1" max="5" value={c.power || 1} onChange={e => upd("power", parseInt(e.target.value))}
                            style={{ flex: 1, accentColor: c.type === "blessing" ? T.bless : T.curse }} />
                          <span style={{ fontSize: 10, color: c.type === "blessing" ? T.bless : T.curse, fontFamily: FONT_UI, fontWeight: 900 }}>{c.power || 1}</span>
                        </div>)}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, width: 40 }}>WEIGHT</span>
                        <input type="range" min="1" max="100" value={c.weight || 100} onChange={e => upd("weight", parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: T.silverBright }} />
                        <span style={{ fontSize: 10, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, width: 24, textAlign: "right" }}>{c.weight || 100}</span></div>
                      <div style={{ padding: 4, background: T.bg2, borderRadius: 3, marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <div style={LBL}>IN SETS</div>
                          <button onClick={() => { const n = prompt("New Set Name:"); if (n && !sets.some(s => s.name === n)) setSets(p => [...p, { id: "s_" + Date.now(), name: n, cardIds: [c.id] }]); }}
                            style={{ background: "none", border: "none", color: T.silverBright, cursor: "pointer", fontSize: 8, fontFamily: FONT_UI, fontWeight: 800 }}>+ NEW SET</button>
                        </div>
                        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                          {sets.map((s, i) => {
                            return (<button key={i} onClick={() => togSet(i, c.id)} style={{
                              padding: "2px 5px", border: `1px solid ${s.cardIds.includes(c.id) ? T.silverBright : T.panelBorder}`,
                              background: s.cardIds.includes(c.id) ? T.silverBright + "15" : "transparent", borderRadius: 2,
                              color: s.cardIds.includes(c.id) ? T.silverBright : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, fontWeight: 700,
                              display: "inline-flex", alignItems: "center", gap: 2
                            }}>
                              {s.name}</button>);
                          })}</div></div>
                      <div style={{ fontSize: 8, color: T.textDim, marginBottom: 4 }}>Owned: {owned(c.id)} · Power: {cPwr(c)} · ID: {c.id}</div>
                      {/* Prev/Next nav */}
                      <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                        <button onClick={() => { const idx = filtered.findIndex(x => x.id === c.id); if (idx > 0) setEditCard(filtered[idx - 1]); }}
                          disabled={filtered.findIndex(x => x.id === c.id) <= 0}
                          style={{ ...B(T.textDim, filtered.findIndex(x => x.id === c.id) <= 0), flex: 1, fontSize: 9 }}>← Prev</button>
                        <button onClick={() => { const idx = filtered.findIndex(x => x.id === c.id); if (idx < filtered.length - 1) setEditCard(filtered[idx + 1]); }}
                          disabled={filtered.findIndex(x => x.id === c.id) >= filtered.length - 1}
                          style={{ ...B(T.textDim, filtered.findIndex(x => x.id === c.id) >= filtered.length - 1), flex: 1, fontSize: 9 }}>Next →</button>
                      </div>
                      <button onClick={() => { setCardPool(p => p.filter(x => x.id !== c.id)); setEditCard(null); }}
                        style={{ ...B(T.danger), width: "100%", fontSize: 8 }}>Delete Card</button>
                    </div>);
                })()}
              </div>
            </div>);
        })()}

      </main>
    </div>
  );
}
