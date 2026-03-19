import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FONT_TITLE, FONT_UI, FONT_BODY, FONT_URL, THEME as T, TYPE_COLORS as TC,
  DEFAULT_GRADS as DG, RARITY_COLORS as RC, RARITY_ORDER as RO,
  STAT_DEFS, STAT_MIN, STAT_MAX, C_MAX, DECK_SIZE, HAND_SIZE, MAX_COPIES,
  TOKENS_START, TOKENS_PER_WIN, PACK_COST, CARDS_PER_PACK,
  TRIBUTE_SUMMON_ENABLED,
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
    if (c.type === "bless") return sum + cPwr(c);
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
// All 8 surrounding cells (Chebyshev distance 1) for transcendent entity range
function adjFull(r, c) {
  const o = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) o.push([nr, nc]);
  }
  return o;
}
function isTranscendent(c) { return (c.soul || 0) + (c.mind || 0) + (c.will || 0) === 0; }
function isVoid(c) { return !c.soul && !c.mind && !c.will; } // strictly 0/0/0 — can purge terrain & traps
function nextCardId(type, allCards) {
  const PREFIX = { being: "ENT", bless: "BLE", curse: "CUR", equip: "EQU", field: "TER" };
  const pfx = PREFIX[type] || "UNK";
  const re = new RegExp(`^${pfx}-(\\d{5})$`);
  let max = 0;
  for (const c of allCards) { const m = c.id?.match(re); if (m) max = Math.max(max, parseInt(m[1])); }
  return `${pfx}-${String(max + 1).padStart(5, "0")}`;
}
// Returns false if moving from (r,c) to (tr,tc) would jump over a blocking entity
function canReach(r, c, tr, tc, bd) {
  const dr = tr - r, dc = tc - c;
  if (Math.abs(dr) === 2 && dc === 0) { const mid = bd[r + dr / 2]?.[c]; return !mid || mid.fd; }
  if (Math.abs(dc) === 2 && dr === 0) { const mid = bd[r]?.[c + dc / 2]; return !mid || mid.fd; }
  return true;
}
function hasAdjField(r, c, bd) {
  return adj(r, c).some(([ar, ac]) => bd[ar]?.[ac]?.cd.type === "field");
}
function renderStatFilter(statF, setStatF) {
  const vals = [null, -3, -2, -1, 0, 1, 2, 3];
  const anyActive = STAT_DEFS.some(s => statF[s.key] !== null);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {STAT_DEFS.map(({ key, label, color }) => (
        <div key={key} style={{ display: "flex", gap: 1, alignItems: "center" }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 7, color, fontWeight: 800, width: 10, textAlign: "right", marginRight: 1 }}>{label}</span>
          {vals.map(v => {
            const sel = statF[key] === v;
            return (
              <button key={v ?? "·"} onClick={() => setStatF(p => ({ ...p, [key]: sel ? null : v }))}
                style={{
                  padding: "1px 3px", border: `1px solid ${sel ? color : T.panelBorder}`,
                  background: sel ? color + "22" : "transparent", borderRadius: 2,
                  color: sel ? color : T.textDim, cursor: "pointer",
                  fontFamily: FONT_UI, fontSize: 6, fontWeight: 800, minWidth: 14, textAlign: "center",
                }}>
                {v === null ? "·" : v > 0 ? `+${v}` : v}
              </button>
            );
          })}
        </div>
      ))}
      {anyActive && (
        <button onClick={() => setStatF(() => ({ soul: null, mind: null, will: null }))}
          style={{ padding: "1px 5px", border: `1px solid ${T.panelBorder}`, background: "transparent", borderRadius: 2, color: T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 800 }}>
          ✕
        </button>
      )}
    </div>
  );
}
function countAdjFaceUpFields(r, c, bd) {
  return adjFull(r, c).filter(([ar, ac]) => { const cl = bd[ar]?.[ac]; return cl?.cd?.type === "field" && !cl.fd; }).length;
}

function tBonus(bd, r, c) {
  const b = { soul: 0, mind: 0, will: 0 };
  adjFull(r, c).forEach(([ar, ac]) => {
    const cl = bd[ar]?.[ac];
    if (cl?.cd?.type === "field" && !cl.fd) STAT_DEFS.forEach(s => { b[s.key] += cl.cd[s.key] || 0; });
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

const JP_TYPES = { being: "存在", bless: "祝福", curse: "呪い", equip: "装備", field: "領域" };
const JP_STATS = { soul: "魂", mind: "心", will: "意" };
const JP = {
  // flash text
  "SUMMON":"召喚","FIELD":"領域","PURGE":"除去","EQUIP":"装備","SET":"伏せ","SET EQUIP":"装備セット",
  "TRIBUTE":"生贄","Genesis":"創世","RECYCLE":"再生","AWAKENING":"覚醒","REVENANCE":"回帰",
  "ENLIGHTENMENT":"悟り","OBLIVION":"虚無","DEFEAT":"敗北",
  "TRAP DEFUSED":"罠解除","FIELD ACTIVATED":"領域発動","FIELD DIFFUSED":"領域消滅",
  "FIELD FREED":"領域解放","EQUIP ACTIVATED":"装備発動","EQUIP DIFFUSED":"装備消滅",
  // turn panel
  "Your Turn":"あなたのターン","Opponent...":"相手のターン",
  "✦ VICTORY":"✦ 勝利","▽ DEFEAT":"▽ 敗北",
  // buttons
  "END TURN":"ターン終了","Cancel":"中止","Forfeit":"投了",
  "ending turn…":"終了中…","NEW GAME":"新ゲーム",
  // inspect
  "SECRET":"不明","HIDDEN":"秘密","You":"自分","Opp":"相手",
  // conviction
  "NEXUS":"頂点",
};
function Card({ card, sz, fill, onClick, sel, fDown, dim, owner, sparkle, noRar, notOwned, mask, artMask, effStats, viewerRole, locale }) {
  if (!card) return null;
  const jp = locale === "jp";
  const w = fill ? "100%" : sz;
  const h = fill ? "100%" : undefined;
  const fs = fill ? 10 : (sz || 80) < 60 ? 5 : (sz || 80) < 100 ? 7 : (sz || 80) < 150 ? 9 : 11;
  const stripH = fill ? 14 : (sz || 80) < 60 ? 8 : (sz || 80) < 100 ? 10 : (sz || 80) < 150 ? 14 : 18;
  const o = effStats ? orient({ ...card, ...effStats }) : orient(card);
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
      transition: "all 0.12s", transform: sel ? "translateY(-10px)" : "none",
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
      ) : artMask && !card.image ? (
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
          {card.type === "being" && <span style={{
            position: "absolute", top: 2, left: 2, fontSize: fs,
            background: "#000a", borderRadius: 2, padding: "0 3px", color: oCol(o),
            fontFamily: FONT_UI, fontWeight: 900, lineHeight: 1.4,
            display: "inline-flex", alignItems: "center"
          }}>
            {o === "light" ? "△" : o === "dark" ? "▽" : <span style={{ fontSize: "1.3em", lineHeight: 1 }}>✡</span>}</span>}
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
          {(() => {
            const isSecret = fDown && owner && viewerRole && owner !== viewerRole;
            if (isSecret) return <span style={{ fontSize: fs, color: T.textDim, fontFamily: FONT_UI, fontWeight: 800, width: "100%", textAlign: "center" }}>{jp ? "伏せ" : "SET"}</span>;

            return (<>
              {card.type !== "being" && <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <span style={{
                  fontSize: fs - 1, color: TC[card.type], fontFamily: FONT_UI,
                  textTransform: "uppercase", fontWeight: 800, flexShrink: 0
                }}>{jp ? (JP_TYPES[card.type] ?? card.type) : card.type}</span>
                {(card.type === "bless" || card.type === "curse") && (
                  <span style={{ fontSize: fs, fontFamily: FONT_UI, fontWeight: 900, color: card.type === "bless" ? T.bless : T.curse }}>
                    {card.type === "bless" ? "+" : "−"}{cPwr(card)}C
                  </span>
                )}
                {(card.type === "equip" || card.type === "field") && <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
                  {STAT_DEFS.map(s => {
                    const v = card[s.key] || 0; return v !== 0 ? (
                      <span key={s.key} style={{ fontSize: fs, color: v > 0 ? s.color : T.curse, fontWeight: 800 }}>{s.label}{v > 0 ? "+" : ""}{v}</span>) : null;
                  })}
                </div>}
              </div>}
              {card.type === "being" && <div style={{ display: "flex", gap: fill ? 6 : (sz || 80) < 60 ? 2 : 4, width: "100%", justifyContent: "center" }}>
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
            </>);
          })()}
        </div>
      )}
    </div>
  );
}

// ═══ BIG FLASH — shows card art, battles, and video ═══
function Flash({ flash, boardRef, slamAnim = true, cinemaMode = false, cinemaRef, cinemaSwap = false }) {
  const [rect, setRect] = useState(null);

  const [boardRect, setBoardRect] = useState(null);
  useLayoutEffect(() => {
    const el = boardRef?.current;
    setBoardRect(el ? el.getBoundingClientRect() : null);
    if (cinemaMode) {
      setRect(cinemaRef?.current ? cinemaRef.current.getBoundingClientRect() : null);
    } else {
      setRect(el ? el.getBoundingClientRect() : null);
    }
  }, [flash, cinemaMode]);

  useEffect(() => {
    if (flash?.video && flash?.onVideoEnd) {
      const wait = flash.dur !== undefined ? flash.dur : 2650;
      const t = setTimeout(() => flash.onVideoEnd(), wait);
      return () => clearTimeout(t);
    }
  }, [flash]);

  if (!flash) return null;
  const isBattle = flash.atkCard && flash.defCard;
  const hasVideo = flash.video;

  /* ── Cinema Mode ── */
  if (cinemaMode) {
    const CINEMA_ART = 280;
    const dur = isBattle ? 2.65 : hasVideo ? ((flash.dur || 4000) + 900) / 1000 : flash.image ? 2.2 : 1.1;
    // Compute void center dynamically — read board rect live
    const bEl = boardRef?.current;
    const br = bEl ? bEl.getBoundingClientRect() : null;
    const vw = window.innerWidth;
    let voidCenterX, voidCenterY;
    if (br) {
      voidCenterX = cinemaSwap ? (br.right + vw) / 2 : br.left / 2;
      voidCenterY = (br.top + br.bottom) / 2;
    } else {
      voidCenterX = cinemaSwap ? vw * 0.85 : vw * 0.15;
      voidCenterY = window.innerHeight * 0.4;
    }

    // Wrapper positions, inner animates — so animation transform doesn't clobber translate
    const cWrap = { position: "fixed", left: voidCenterX, top: voidCenterY, transform: "translate(-50%, -50%)", zIndex: 9999, pointerEvents: "none" };

    if (isBattle) {
      const atkWon = flash.atkWon;
      const tie = flash.tie;
      return (
        <div style={cWrap}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          animation: `cinemaBattleIn ${dur}s ease-out forwards`,
        }}>
          <div style={{
            width: CINEMA_ART, height: CINEMA_ART, borderRadius: 5, overflow: "hidden",
            border: `2px solid ${tie ? T.textDim : atkWon ? T.bless : T.curse}`,
            boxShadow: `0 0 20px ${tie ? T.textDim : atkWon ? T.bless : T.curse}44`,
            animation: tie ? "battleTie 0.9s ease-in forwards" : atkWon ? `cinemaWinUp 1.1s ease-in forwards` : `cinemaLoseDown 1.1s ease-in forwards`,
            animationDelay: "1s", animationFillMode: "forwards",
          }}>
            <img src={flash.atkCard.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <div style={{ fontFamily: FONT_TITLE, fontSize: 16, color: T.silver }}>VS</div>
            <div style={{ fontSize: 8, fontFamily: FONT_UI, fontWeight: 900, letterSpacing: 2,
              color: flash.color || T.silverBright, textTransform: "uppercase"
            }}>{flash.text}</div>
          </div>
          <div style={{
            width: CINEMA_ART, height: CINEMA_ART, borderRadius: 5, overflow: "hidden",
            border: `2px solid ${tie ? T.textDim : !atkWon ? T.bless : T.curse}`,
            boxShadow: `0 0 20px ${tie ? T.textDim : !atkWon ? T.bless : T.curse}44`,
            animation: tie ? "battleTie 0.9s ease-in forwards" : !atkWon ? `cinemaWinUp 1.1s ease-in forwards` : `cinemaLoseDown 1.1s ease-in forwards`,
            animationDelay: "1s", animationFillMode: "forwards",
          }}>
            <img src={flash.defCard.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
        </div>
      );
    }

    /* Non-battle cinema */
    return (
      <div style={cWrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        animation: `cinemaIn ${dur}s ease-out forwards`,
      }}>
        <div style={{
          width: CINEMA_ART, height: CINEMA_ART, borderRadius: 5, overflow: "hidden",
          border: `1px solid ${flash.border || T.silver}30`,
          boxShadow: `0 0 30px ${flash.border || T.silver}18`,
          background: (!hasVideo && !flash.image) ? T.card : "#000",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {hasVideo ? (
            <video src={flash.video} autoPlay muted playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onCanPlay={(e) => { e.target.playbackRate = 0.87; }}
              onEnded={() => { if (flash.onVideoEnd) flash.onVideoEnd(); }}
              onError={(e) => {
                e.target.style.display = 'none';
                if (flash.onVideoEnd) setTimeout(() => flash.onVideoEnd(), 1800);
              }} />
          ) : flash.image ? (
            <img src={flash.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : flash.icon ? (
            <span style={{
              fontFamily: FONT_TITLE, fontSize: 80,
              color: flash.color || T.silverBright,
              textShadow: `0 0 40px ${flash.color || T.silver}66`,
              lineHeight: 1, userSelect: "none"
            }}>{flash.icon}</span>
          ) : null}
        </div>
        <div style={{ textAlign: "center", padding: "0 8px" }}>
          <div style={{
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: 3,
            color: flash.color || T.silverBright, textTransform: "uppercase",
            textShadow: `0 0 16px ${flash.color || T.silver}33`,
          }}>
            {(flash.icon && (flash.image || hasVideo)) && <span style={{ marginRight: 5, fontFamily: flash.iconFont || "inherit" }}>{flash.icon}</span>}{flash.text}
          </div>
          {flash.sub && <div style={{
            fontSize: 9, letterSpacing: 2, marginTop: 3, opacity: 0.5,
            fontFamily: FONT_UI, fontWeight: 600, color: flash.color || T.silverBright,
          }}>{flash.sub}</div>}
        </div>
      </div>
      </div>
    );
  }

  /* ── Theatre / Classic Mode (original) ── */
  // Slam mode: snap to center 3x3 grid cells; Classic mode: full board centered
  let posStyle, summonSz = 324;
  if (rect) {
    if (!isBattle && slamAnim) {
      const pad = 2, gap = 2;
      const cw = (rect.width - 2 * pad - 4 * gap) / 5;
      const ch = (rect.height - 2 * pad - 4 * gap) / 5;
      const x = rect.left + pad + (cw + gap);
      const y = rect.top + pad + (ch + gap);
      const w = 3 * cw + 2 * gap;
      const h = 3 * ch + 2 * gap;
      posStyle = { left: x, top: y, width: w, height: h };
      summonSz = Math.floor(Math.min(w, h) * 0.75);
    } else {
      posStyle = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  } else {
    posStyle = { inset: 0 };
  }

  const BATTLE_ART = 324;
  const ART_SZ = 292;
  const classicAnim = "flashAnim 1.6s ease-out forwards";
  const slamAnimStr = "summonSlam 2s ease-out forwards";
  const dur = isBattle ? "battleFlash 2.4s ease-out forwards" : slamAnim ? slamAnimStr : classicAnim;
  return (
    <>
      {/* Animated summon/battle card */}
      <div style={{
        position: "fixed", zIndex: 9999, pointerEvents: "none",
        ...posStyle,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: dur,
      }}>
        <div style={{
          display: "flex",
          flexDirection: isBattle ? "row" : (flash.image || hasVideo) ? "column" : "row",
          alignItems: "center", justifyContent: "center",
          ...(slamAnim ? {
            gap: isBattle ? 16 : 14, borderRadius: 6, background: "#06060df2",
            border: `1px solid ${flash.border || T.silver}30`,
            boxShadow: `0 0 80px ${flash.border || T.silver}22, inset 0 0 60px rgba(0,0,0,0.4)`,
            ...(isBattle ? { padding: "20px 30px" } : { width: "100%", height: "100%", padding: "18px 16px 14px" }),
          } : {
            gap: isBattle ? 16 : 10, borderRadius: 3, background: "#04040af0",
            border: `1.5px solid ${flash.border || T.silver}`,
            boxShadow: `0 0 60px ${flash.border || T.silver}33`,
            padding: isBattle ? "20px 30px" : (flash.image || hasVideo) ? "16px 24px" : "10px 28px",
          }),
        }}>
          {isBattle ? (<>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: BATTLE_ART, height: BATTLE_ART, borderRadius: 4, border: `2px solid ${flash.tie ? T.textDim : flash.atkWon ? T.bless : T.curse}`,
                background: `url(${flash.atkCard.image}) center/cover`, transition: "all .6s",
                animation: flash.tie ? "battleTie 0.9s ease-in forwards" : flash.atkWon ? "none" : "battleLoseL 1.1s linear forwards", animationDelay: "0.8s",
                opacity: 1
              }} />
              <div style={{
                fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, color: flash.tie ? T.textDim : flash.atkWon ? T.silverBright : T.textDim,
                marginTop: 4
              }}>{flash.atkCard.name || "Attacker"}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ fontFamily: FONT_TITLE, fontSize: 20, color: T.silver }}>VS</div>
              <div style={{
                fontSize: 9, fontFamily: FONT_UI, fontWeight: 900, letterSpacing: 2,
                color: flash.color || T.silverBright, textTransform: "uppercase"
              }}>{flash.text}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: BATTLE_ART, height: BATTLE_ART, borderRadius: 4, border: `2px solid ${flash.tie ? T.textDim : !flash.atkWon ? T.bless : T.curse}`,
                background: `url(${flash.defCard.image}) center/cover`, transition: "all .6s",
                animation: flash.tie ? "battleTie 0.9s ease-in forwards" : !flash.atkWon ? "none" : "battleLoseR 1.1s linear forwards", animationDelay: "0.8s",
                opacity: 1
              }} />
              <div style={{
                fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, color: flash.tie ? T.textDim : !flash.atkWon ? T.silverBright : T.textDim,
                marginTop: 4
              }}>{flash.defCard.name || "Defender"}</div>
            </div>
          </>) : (<>
            <div style={{
              ...(slamAnim
                ? { flex: "1 1 0", minHeight: 0, aspectRatio: "1/1", maxWidth: "100%" }
                : { width: ART_SZ, height: ART_SZ, flexShrink: 0 }),
              borderRadius: slamAnim ? 5 : 4,
              border: slamAnim ? `1px solid ${flash.border || T.silver}28` : `2px solid ${flash.border || T.silver}44`,
              background: (!hasVideo && !flash.image) ? T.card : "#000",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: slamAnim ? `0 2px 20px rgba(0,0,0,0.5)` : "none", overflow: "hidden",
            }}>
              {hasVideo ? (
                <video src={flash.video} autoPlay muted playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onCanPlay={(e) => { e.target.playbackRate = 0.87; }}
                  onEnded={() => { if (flash.onVideoEnd) flash.onVideoEnd(); }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (flash.onVideoEnd) {
                      setTimeout(() => flash.onVideoEnd(), 1800);
                    }
                  }} />
              ) : flash.image ? (
                <img src={flash.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
              {!hasVideo && !flash.image && flash.icon && (
                <span style={{
                  fontFamily: FONT_TITLE, fontSize: slamAnim ? "clamp(48px, 40%, 148px)" : 148,
                  color: flash.color || T.silverBright,
                  textShadow: `0 0 50px ${flash.color || T.silver}88, 0 0 12px ${flash.color || T.silver}55`,
                  lineHeight: 1, userSelect: "none"
                }}>{flash.icon}</span>
              )}
            </div>
            <div style={{ textAlign: "center", flexShrink: 0, padding: slamAnim ? "2px 8px 0" : 0, marginTop: (flash.image || hasVideo) ? (slamAnim ? 8 : 12) : 0 }}>
              <div style={{
                fontFamily: FONT_UI, fontWeight: slamAnim ? 800 : 900,
                fontSize: (flash.image || hasVideo) ? (slamAnim ? 14 : 20) : (slamAnim ? 16 : 22),
                letterSpacing: slamAnim ? 3 : 4,
                color: flash.color || T.silverBright, textTransform: "uppercase",
                textShadow: `0 0 20px ${flash.color || T.silver}44`,
                lineHeight: slamAnim ? 1.3 : 1,
              }}>
                {(flash.icon && (flash.image || hasVideo)) && <span style={{ marginRight: 6, fontFamily: flash.iconFont || "inherit" }}>{flash.icon}</span>}{flash.text}
              </div>
              {flash.sub && <div style={{
                fontSize: slamAnim ? 10 : 9, letterSpacing: slamAnim ? 3 : 2,
                marginTop: slamAnim ? 4 : 2, opacity: slamAnim ? 0.5 : 0.6,
                fontFamily: FONT_UI, fontWeight: slamAnim ? 600 : 400,
                color: flash.color || T.silverBright,
              }}>{flash.sub}</div>}
            </div>
          </>)}
        </div>
      </div>
    </>
  );
}

function CDisp({ value, label, cMax = C_MAX, locale }) {
  const jp = locale === "jp";
  const pct = Math.min(Math.abs(value) / cMax, 1);
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
        {atN ? (jp ? "頂点" : "NEXUS") : value > 0 ? `${cMax - value}↑` : `${cMax + value}↓`}</div>
    </div>
  );
}

const CAMPAIGN_SET_IDS = ["set_a", "set_c", "set_d", "set_g", "set_l", "set_q", "set_r", "set_s", "set_u", "set_w", "set_x", "set_z"];
const DEFAULT_SETTINGS = { cMax: C_MAX, handSize: HAND_SIZE, actionsPerTurn: 3, deckSize: DECK_SIZE, maxCopies: MAX_COPIES, spellBudget: 10, tokensStart: TOKENS_START, tokensPerWin: TOKENS_PER_WIN, packCost: PACK_COST, cardsPerPack: CARDS_PER_PACK, tributeSummonEnabled: false, locale: "en", slamAnim: true, cinemaMode: false, cinemaSwap: false, noAnim: false };
// ── Action types ─────────────────────────────────────────────────────────────
// Every mutation to game state must go through one of these identifiers.
// The sync layer uses them; game rules live in the handlers — not here.
const ACTION_TYPES = {
  DRAW:      "DRAW",
  PLAY_BC:   "PLAY_BC",
  SUMMON:    "SUMMON",
  TERRAIN:   "TERRAIN",
  EQUIP:     "EQUIP",
  MOVE:      "MOVE",
  ATTACK:    "ATTACK",
  SET_TRAP:  "SET_TRAP",
  SET_EQUIP:      "SET_EQUIP",
  TRIBUTE_SUMMON: "TRIBUTE_SUMMON",
  FLIP:           "FLIP",
  END_TURN:       "END_TURN",
};
const TYPE_PREFIX = { being: "ENT", bless: "BLE", curse: "CUR", equip: "EQU", field: "TER" };
function computeStartCounters(existingCards) {
  const r = {};
  for (const [type, prefix] of Object.entries(TYPE_PREFIX)) {
    const nums = existingCards.filter(c => c.id.startsWith(prefix + "-")).map(c => parseInt(c.id.slice(prefix.length + 1)) || 0);
    r[type] = (nums.length ? Math.max(...nums) : 0) + 1;
  }
  return r;
}

function VirtualCardGrid({ cards, renderCard, cardWidth = 103, rowHeight = 120, containerStyle = {} }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor(containerWidth / cardWidth));
  const rows = useMemo(() => {
    const r = [];
    for (let i = 0; i < cards.length; i += cols) r.push(cards.slice(i, i + cols));
    return r;
  }, [cards, cols]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  });

  return (
    <div ref={containerRef} style={{ overflowY: "auto", width: "100%", ...containerStyle }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vRow => (
          <div key={vRow.key} style={{ position: "absolute", top: vRow.start, left: 0, right: 0, display: "flex", gap: 3 }}>
            {rows[vRow.index].map(card => renderCard(card))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Main
export default function Trinity() {
  const [tab, setTab] = useState("play");
  const [cardPool, setCardPoolRaw] = useState([]);
  const setCardPool = useCallback((val) => {
    setCardPoolRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      const seen = new Set();
      return next.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
    });
  }, []);
  const [coll, setColl] = useState({});
  const [decks, setDecks] = useState([]);
  const [selDI, setSelDI] = useState(0); const [oppDI, setOppDI] = useState(1);
  const [sets, setSets] = useState([]);
  const [dbR, setDbR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Shadow imported constants with live settings values
  // eslint-disable-next-line no-shadow
  const { cMax: C_MAX, handSize: HAND_SIZE, actionsPerTurn, deckSize: DECK_SIZE, maxCopies: MAX_COPIES, spellBudget, tokensStart: TOKENS_START, tokensPerWin: TOKENS_PER_WIN, packCost: PACK_COST, cardsPerPack: CARDS_PER_PACK, tributeSummonEnabled: TRIBUTE_SUMMON_ENABLED, locale, slamAnim, cinemaMode, cinemaSwap } = settings;
  const jp = locale === "jp";
  const t = s => jp ? (JP[s] ?? s) : s;
  const [tokens, setTokens] = useState(TOKENS_START);
  const [tokenFlash, setTokenFlash] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ═══ MULTIPLAYER STATE ═══
  const [mMode, setMMode] = useState(false);
  const [mRole, setMRole] = useState(null); // "player", "ai", or "spectator"
  const [mAlias, setMAlias] = useState(null);     // my chosen emoji identifier
  const [mOppAlias, setMOppAlias] = useState(null); // opponent's emoji
  const [actionLog, setActionLog] = useState([]); // audit trail: { type, seq, ts, remote?, c, tn, ...payload }
  const gameStartRef = useRef(null);              // timestamp of current game start
  const endTurnRef = useRef(null);                // always-current ref to endTurn
  const [mTaken, setMTaken] = useState([]);
  const mTakenRef = useRef([]);
  const curR = (mMode ? (mRole === "p1" ? "player" : "ai") : "player");
  const [mOppDeck, setMOppDeck] = useState(null);
  const [mWait, setMWait] = useState(false);
  const ws = useRef(null);
  const mRoleRef = useRef(null);
  const aiPlanRef = useRef([]);
  const videoCacheRef = useRef({});  // stem -> "/videos/..." or null

  const playSfx = useCallback((type, fromRemote = false) => {
    if (!audioEnabled || muted) return;

    let url = "";
    if (type === "summon" || type === "action") url = "/audio/action.mp3";
    else if (type === "judgment") url = "/audio/play.mp3";
    else if (type === "select") url = "/audio/select.mp3";
    else if (type === "revenance") url = "/audio/revenance.mp3";
    else if (type === "revenance-pos") url = "/audio/positive.mp3";
    else if (type === "revenance-neg") url = "/audio/negative.mp3";
    else if (type === "pack") url = "/audio/play.mp3";
    else if (type === "diffuse") url = "/audio/trap-diffuse.mp3";
    else if (type.startsWith("battle-")) url = `/audio/${type}.mp3`;
    else if (type === "draw") {
      const idx = Math.floor(Math.random() * 2) + 1;
      url = `/audio/draw-${idx}.mp3`;
    }
    if (url) {
      const a = new Audio(url);
      a.volume = 0.4;
      a.play().catch(() => { });
    }

    if (mMode && ws.current?.readyState === WebSocket.OPEN && !fromRemote) {
      // Broadcast specific sounds
      if (type.startsWith("battle-") || type.startsWith("revenance") || type === "diffuse") {
        ws.current.send(JSON.stringify({ type: "sync_sfx", sound: type, sender: mRoleRef.current }));
      }
    }
  }, [audioEnabled, muted, mMode]);

  const [flash, setFlash] = useState(null); const fQ = useRef([]); const fB = useRef(false);
  const [boardDim, setBoardDim] = useState(false); const dimTimer = useRef(null);
  const boardRef = useRef(null);
  const cinemaRef = useRef(null);
  const enqF = useCallback((text, opts = {}) => {
    if (settings.noAnim) return;
    fQ.current.push({ text: jp ? (JP[text] ?? text) : text, ...opts });
    if (!fB.current) drF();

    if (mMode && ws.current?.readyState === WebSocket.OPEN && !opts.fromRemote) {
      // Strip hidden info for private actions so opponent sees the animation but not the card
      const isPrivate = text === "DRAW" || text === "FREE DRAW" || text === "SET";
      const broadcastOpts = isPrivate
        ? { color: opts.color, border: opts.border, icon: opts.icon, fromRemote: true }
        : { ...opts, fromRemote: true };
      ws.current.send(JSON.stringify({
        type: "sync_anim",
        flash: { text, opts: broadcastOpts },
        sender: mRoleRef.current
      }));
    }
  }, [mMode, locale, settings.noAnim]);
  function drF() {
    if (!fQ.current.length) { fB.current = false; return; } fB.current = true;
    if (settings.noAnim) { fQ.current = []; fB.current = false; setFlash(null); return; }
    const f = fQ.current.shift();
    if (f.video) {
      f.onVideoEnd = () => { setFlash(null); setTimeout(drF, 50); };
      setFlash(f);
      const wait = f.dur !== undefined ? f.dur + 600 : 5000;
      setTimeout(() => { if (flash === f) { setFlash(null); setTimeout(drF, 50); } }, wait);
    } else {
      setFlash(f);
      const dur = f.dur !== undefined ? f.dur : (f.atkCard ? 2400 : f.image ? 1800 : 900);
      setTimeout(() => { setFlash(null); setTimeout(drF, 50); }, dur);
    }
  }

  const [game, setGame] = useState(null);
  const [selH, setSelH] = useState(null); const [selB, setSelB] = useState(null);
  const [hl, setHl] = useState([]); const [mode, setMode] = useState(null); const [tapTgt, setTapTgt] = useState(null);
  const [log, setLog] = useState([]); const logRef = useRef(null); const [aiR, setAiR] = useState(false); const forfeitRef = useRef(false);
  const [pit, setPit] = useState({ player: [], ai: [] }); const [showPit, setShowPit] = useState(false);
  const [recentPit, setRecentPit] = useState([]);
  const [inspCell, setInspCell] = useState(null);

  const [nc, setNc] = useState({
    name: "", type: "being", soul: 0, mind: 0, will: 0, power: 1,
    gradient: DG.being, image: null, rarity: "common", set: ""
  });
  const [editDeck, setEditDeck] = useState(null);
  const [deckSortMode, setDeckSortMode] = useState("type"); // "type" or "rarity"
  const [deckStatF, setDeckStatF] = useState({ soul: null, mind: null, will: null });
  const [showAutoGen, setShowAutoGen] = useState(false); // kept for compat but unused after forge move
  const [autoGenCfg, setAutoGenCfg] = useState({ count: 4, deckSize: DECK_SIZE, factionMode: "bless", artOnly: false });
  const [bF, setBF] = useState("all"); const [bSetF, setBSetF] = useState("all"); const [bStatF, setBStatF] = useState({ soul: null, mind: null, will: null });
  const [bDet, setBDet] = useState(null); const [editN, setEditN] = useState(null);
  const [packRes, setPackRes] = useState([]); const [packFlip, setPackFlip] = useState([]); const [packSp, setPackSp] = useState([]);
  const [selSI, setSelSI] = useState(0);
  const [editCard, setEditCard] = useState(null);
  const [showArtPanel, setShowArtPanel] = useState(false);
  const [edF, setEdF] = useState({ set: "all", type: "all", rarity: "all", art: "all", sort: "id", soul: null, mind: null, will: null }); // editor filters
  const [forgeMode, setForgeMode] = useState("single");
  const [allImages, setAllImages] = useState([]);
  const [forgeImgSize, setForgeImgSize] = useState(80);
  const [genMode, setGenMode] = useState("random"); // "random" or "permute"
  const [genSeed, setGenSeed] = useState(42);
  const [camSeed, setCamSeed] = useState(42);
  const [genImages, setGenImages] = useState({}); // { rowIndex: dataUrl }
  const dragRef = useRef(null); // for drag-swap in forge table
  const randSetColor = () => "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
  const [gen, setGen] = useState({
    name: "New Set", total: 20,
    color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
    pctEntity: 50, pctBless: 15, pctCurse: 15, pctTerrain: 10, pctItem: 10,
    powerMin: 2, powerMax: 6,
    blessPwrMin: 1, blessPwrMax: 3, cursePwrMin: 1, cursePwrMax: 3,
    rarCommon: 64, rarUncommon: 24, rarRare: 8, rarLegendary: 4,
  });
  const [camGen, setCamGen] = useState({
    cardsPerSet: 330,
    distMode: "bell",
    bellSpread: 60,
    startPowerMin: 0, startPowerMax: 3,
    endPowerMin: 1, endPowerMax: 9,
    pctEntity: 55, pctBless: 15, pctCurse: 15, pctTerrain: 5, pctItem: 10,
    startBlessPwrMin: 1, startBlessPwrMax: 3, endBlessPwrMin: 1, endBlessPwrMax: 5,
    startCursePwrMin: 1, startCursePwrMax: 3, endCursePwrMin: 1, endCursePwrMax: 5,
    startEquipPwrMin: 1, startEquipPwrMax: 3, endEquipPwrMin: 1, endEquipPwrMax: 5,
    startTerrPwrMin: 1, startTerrPwrMax: 3, endTerrPwrMin: 1, endTerrPwrMax: 5,
    startRarCommon: 75, startRarUncommon: 18, startRarRare: 5, startRarLegendary: 2,
    endRarCommon: 50, endRarUncommon: 38, endRarRare: 20, endRarLegendary: 2,
    ensureTypes: true,
  });

  useEffect(() => {
    let socket = null;
    let reconnectTimer = null;
    let attempt = 0;
    let disposed = false; // Prevents reconnect after StrictMode cleanup

    function connect() {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname || "localhost";
      const wsUrl = `${protocol}//${host}:4000/game-ws`;
      console.log("[Multiplayer] Connecting to:", wsUrl, "(attempt", attempt + 1, ")");

      socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("[Multiplayer] Connected!");
        attempt = 0;
        socket.send(JSON.stringify({ type: "join" }));
      };

      socket.onerror = (e) => {
        console.error("[Multiplayer] WebSocket Error:", e);
      };

      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "welcome") {
          console.log("[Multiplayer] Welcome! Role:", msg.role);
          mRoleRef.current = msg.role;
          setMRole(msg.role);
          setMTaken(msg.taken);
          mTakenRef.current = msg.taken;
          if (msg.state) setGame(msg.state);
          // Auto-assign a random icon, ensuring it differs from any already-taken alias
          if (msg.role !== "spectator") {
            const ICONS = ["📜", "🗝️", "🕯️", "🏺", "⏳", "🪔", "🪶"];
            const takenAliases = Object.values(msg.aliases || {});
            const pool = ICONS.filter(e => !takenAliases.includes(e));
            const autoAlias = (pool.length > 0 ? pool : ICONS)[Math.floor(Math.random() * (pool.length || ICONS.length))];
            setMAlias(autoAlias);
            socket.send(JSON.stringify({ type: "set_alias", role: msg.role, alias: autoAlias }));
          }
        } else if (msg.type === "room_update") {
          const prev = mTakenRef.current;
          const newJoiner = msg.taken.find(r => !prev.includes(r) && r !== mRoleRef.current);
          if (newJoiner) enqF("OPPONENT ENTERED", { color: T.silverBright, icon: "⚔️" });
          mTakenRef.current = msg.taken;
          setMTaken(msg.taken);
        } else if (msg.type === "deck_selected") {
          if (msg.role !== mRoleRef.current) {
            setMOppDeck(msg.deck_name);
            if (msg.role === "p1") setSelDI(msg.deck_idx);
            else if (msg.role === "p2") setOppDI(msg.deck_idx);
          }
        } else if (msg.type === "ready_to_start") {
          setMWait(false);
        } else if (msg.type === "alias_update") {
          if (msg.role !== mRoleRef.current) setMOppAlias(msg.alias || null);
        } else if (msg.type === "game_start") {
          setGame(msg.state);
          setActionLog([]); gameStartRef.current = Date.now();
          setMMode(true);
          setMWait(false);
          setTab("duel");
          enqF("BATTLE START", { color: T.silverBright, icon: "\u2694" });
        } else if (msg.type === "state_update") {
          // Only apply if at least as new as our current state (prevents stale echo)
          setGame(prev => (!prev || !msg.state?.seq || msg.state.seq >= (prev.seq || 0)) ? msg.state : prev);
        } else if (msg.type === "game_action") {
          // Opponent took an action: log it and apply the pre-computed result
          if (msg.action) {
            setActionLog(prev => [...prev.slice(-199), { ...msg.action, seq: msg.seq || 0, ts: Date.now(), remote: true }]);
          }
          if (msg.state) {
            const act = msg.action?.type;
            if ((act === "SUMMON" || act === "TERRAIN") && msg.action?.row !== undefined) {
              // Show animation first, then place entity as it fades — mirrors sender timing
              const { row, col } = msg.action;
              const interim = { ...msg.state, bd: msg.state.bd.map((r, ri) => r.map((cell, ci) => ri === row && ci === col ? null : cell)) };
              setGame(prev => (!prev || interim.seq >= (prev.seq || 0)) ? interim : prev);
              setTimeout(() => setGame(prev => (!prev || msg.state.seq >= (prev.seq || 0)) ? msg.state : prev), 1100);
            } else {
              setGame(prev => (!prev || msg.state.seq >= (prev.seq || 0)) ? msg.state : prev);
            }
          }
        } else if (msg.type === "sync_anim") {
          if (msg.sender !== mRoleRef.current && msg.flash) {
            enqF(msg.flash.text, msg.flash.opts);
          }
        } else if (msg.type === "sync_sfx") {
          if (msg.sender !== mRoleRef.current && msg.sound) {
            playSfx(msg.sound, true);
          }
        } else if (msg.type === "game_reset") {
          setGame(null);
          setMMode(false);
          setMOppDeck(null);
          setMOppAlias(null);
          setMWait(false);
        }
      };

      socket.onclose = (e) => {
        console.log("[Multiplayer] Connection closed:", e.code, e.reason);
        if (!disposed) {
          // Auto-reconnect with backoff (max 10s)
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          attempt++;
          console.log("[Multiplayer] Reconnecting in", delay, "ms...");
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      console.log("[Multiplayer] Cleaning up WebSocket");
      disposed = true; // Stop any further reconnections
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []); // Run only ONCE on mount

  const syncState = useCallback((nextGame) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "sync_state", state: nextGame }));
    }
  }, []);

  // updateGame: the single path for all game state mutations.
  // Pass actionMeta = { type: ACTION_TYPES.X, ...payload } to use action-based sync.
  // Falls back to full-state sync if no action meta is provided.
  const updateGame = useCallback((next, actionMeta = null) => {
    const withSeq = { ...next, seq: (next.seq || 0) + 1 };
    setGame(withSeq);
    if (actionMeta) {
      // Always log — single player AND multiplayer
      setActionLog(prev => [...prev.slice(-499), {
        ...actionMeta, seq: withSeq.seq, ts: Date.now(), c: withSeq.c, tn: withSeq.tn,
      }]);
    }
    if (mMode && ws.current?.readyState === WebSocket.OPEN) {
      if (actionMeta) {
        ws.current.send(JSON.stringify({ type: "game_action", action: actionMeta, state: withSeq, seq: withSeq.seq }));
      } else {
        syncState(withSeq);
      }
    }
  }, [mMode, syncState]);

  // Live preview — deterministic sample that updates as sliders change
  const livePreview = useMemo(() => {
    const { total, pctEntity, pctBless, pctCurse, pctTerrain, pctItem,
      powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
      rarCommon, rarUncommon, rarRare, rarLegendary, ensureTypes } = gen;
    const counts = {
      being: Math.round(total * pctEntity / 100), bless: Math.round(total * pctBless / 100),
      curse: Math.round(total * pctCurse / 100), field: Math.round(total * pctTerrain / 100), equip: Math.round(total * pctItem / 100)
    };
    counts.being += total - Object.values(counts).reduce((a, b) => a + b, 0);
    const rows = []; let seed = genSeed;
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
        if (type === "being") {
          if (genMode === "permute" && perms.length) {
            const p = perms[pIdx++ % perms.length]; s = p.soul; m = p.mind; w = p.will;
          } else {
            for (let a = 0; a < 50; a++) { s = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; m = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; w = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= powerMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= powerMax) break; }
          }
        }
        else if (type === "bless") { pwr = blessPwrMin + Math.floor(sR() * (blessPwrMax - blessPwrMin + 1)); }
        else if (type === "curse") { pwr = cursePwrMin + Math.floor(sR() * (cursePwrMax - cursePwrMin + 1)); }
        else if (type === "field") { const v = [0, 0, 0]; v[Math.floor(sR() * 3)] = sR() > .5 ? 1 : -1; v[(Math.floor(sR() * 3) + 1) % 3] = sR() > .5 ? 1 : -1; s = v[0]; m = v[1]; w = v[2]; }
        else if (type === "equip") {
          const v = [0, 0, 0];
          const mag = 1 + Math.floor(sR() * 3);
          const sign = sR() > 0.5 ? 1 : -1;
          v[Math.floor(sR() * 3)] = mag * sign;
          s = v[0]; m = v[1]; w = v[2];
        }
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
        for (const t of ["being", "bless", "curse", "field", "equip"]) {
          if (rarAssigned >= targetCount) break;
          const idx = rows.findIndex((c, i) => !assignedIds.has(c.id) && c.type === t);
          if (idx >= 0) { rows[idx].rarity = rar; assignedIds.add(rows[idx].id); rarAssigned++; }
        }
      }

      if (rar === "legendary") {
        const lpols = ["light", "dark", "balanced"]; let lpI = 0;
        rows.forEach((card) => {
          if (rarAssigned >= targetCount || assignedIds.has(card.id) || card.type !== "being") return;
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

    const countsMap = new Map();
    rows.forEach(r => {
      const k = `${r.type}|${r.soul}|${r.mind}|${r.will}|${r.power}`;
      countsMap.set(k, (countsMap.get(k) || 0) + 1);
    });
    rows.forEach(r => {
      r.isUnique = countsMap.get(`${r.type}|${r.soul}|${r.mind}|${r.will}|${r.power}`) === 1;
    });

    return rows;
  }, [gen, genMode, genSeed]);

  const campaignPreview = useMemo(() => {
    const lerp = (a, b, t) => a + (b - a) * t;
    const n = CAMPAIGN_SET_IDS.length;
    // Per-set card count distribution
    const total = camGen.cardsPerSet * n;
    let setCounts;
    if (camGen.distMode === "bell") {
      const center = (n - 1) / 2;
      const sigma = Math.max(0.5, (n / 2) * (camGen.bellSpread / 100));
      const weights = Array.from({ length: n }, (_, i) => Math.exp(-0.5 * ((i - center) / sigma) ** 2));
      const sumW = weights.reduce((a, b) => a + b, 0);
      setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
      const diff = total - setCounts.reduce((a, b) => a + b, 0);
      setCounts[Math.floor(n / 2)] = Math.max(1, (setCounts[Math.floor(n / 2)] || 1) + diff);
    } else if (camGen.distMode === "ramp") {
      const weights = Array.from({ length: n }, (_, i) => i + 1);
      const sumW = weights.reduce((a, b) => a + b, 0);
      setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
      const diff = total - setCounts.reduce((a, b) => a + b, 0);
      setCounts[n - 1] = Math.max(1, setCounts[n - 1] + diff);
    } else if (camGen.distMode === "ramp_inv") {
      const weights = Array.from({ length: n }, (_, i) => n - i);
      const sumW = weights.reduce((a, b) => a + b, 0);
      setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
      const diff = total - setCounts.reduce((a, b) => a + b, 0);
      setCounts[0] = Math.max(1, setCounts[0] + diff);
    } else {
      setCounts = Array(n).fill(camGen.cardsPerSet);
    }
    return CAMPAIGN_SET_IDS.map((setId, si) => {
      const t = si / (n - 1);
      const powerMin = Math.round(lerp(camGen.startPowerMin, camGen.endPowerMin, t));
      const powerMax = Math.max(powerMin, Math.round(lerp(camGen.startPowerMax, camGen.endPowerMax, t)));
      const blessPwrMin = Math.round(lerp(camGen.startBlessPwrMin, camGen.endBlessPwrMin, t));
      const blessPwrMax = Math.max(blessPwrMin, Math.round(lerp(camGen.startBlessPwrMax, camGen.endBlessPwrMax, t)));
      const cursePwrMin = Math.round(lerp(camGen.startCursePwrMin, camGen.endCursePwrMin, t));
      const cursePwrMax = Math.max(cursePwrMin, Math.round(lerp(camGen.startCursePwrMax, camGen.endCursePwrMax, t)));
      const equipPwrMin = Math.round(lerp(camGen.startEquipPwrMin, camGen.endEquipPwrMin, t));
      const equipPwrMax = Math.max(equipPwrMin, Math.round(lerp(camGen.startEquipPwrMax, camGen.endEquipPwrMax, t)));
      const terrPwrMin = Math.round(lerp(camGen.startTerrPwrMin, camGen.endTerrPwrMin, t));
      const terrPwrMax = Math.max(terrPwrMin, Math.round(lerp(camGen.startTerrPwrMax, camGen.endTerrPwrMax, t)));
      const rarCommon = Math.round(lerp(camGen.startRarCommon, camGen.endRarCommon, t));
      const rarUncommon = Math.round(lerp(camGen.startRarUncommon, camGen.endRarUncommon, t));
      const rarRare = Math.round(lerp(camGen.startRarRare, camGen.endRarRare, t));
      const rarLegendary = Math.round(lerp(camGen.startRarLegendary, camGen.endRarLegendary, t));
      return { setId, si, t, cards: setCounts[si], powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax, equipPwrMin, equipPwrMax, terrPwrMin, terrPwrMax, rarCommon, rarUncommon, rarRare, rarLegendary };
    });
  }, [camGen]);

  // O(1) lookups — rebuilt only when cardPool or sets change
  const cardMap = useMemo(() => new Map(cardPool.map(c => [c.id, c])), [cardPool]);
  const cardSetMap = useMemo(() => {
    const m = new Map();
    sets.forEach(s => s.cardIds.forEach(id => m.set(id, s.name)));
    return m;
  }, [sets]);

  // Pre-filtered lists so tab switches don't re-run heavy chains
  const browseFiltered = useMemo(() =>
    cardPool.filter(c =>
      (bF === "all" || c.type === bF) &&
      (bSetF === "all" || cardSetMap.get(c.id) === bSetF) &&
      STAT_DEFS.every(s => bStatF[s.key] === null || (c[s.key] || 0) === bStatF[s.key])
    ), [cardPool, cardSetMap, bF, bSetF, bStatF]);

  const editorFiltered = useMemo(() => {
    const sortFns = {
      id: (a, b) => a.id.localeCompare(b.id),
      name: (a, b) => (a.name || "").localeCompare(b.name || ""),
      type: (a, b) => { const o = ["being","bless","curse","equip","field"]; return (o.indexOf(a.type) - o.indexOf(b.type)) || a.type.localeCompare(b.type); },
      rarity: (a, b) => RO.indexOf(a.rarity) - RO.indexOf(b.rarity),
      power: (a, b) => cPwr(b) - cPwr(a),
      noart: (a, b) => (a.image ? 1 : 0) - (b.image ? 1 : 0),
    };
    return cardPool
      .filter(c => edF.set === "all" || cardSetMap.get(c.id) === edF.set)
      .filter(c => edF.type === "all" || c.type === edF.type)
      .filter(c => edF.rarity === "all" || c.rarity === edF.rarity)
      .filter(c => edF.art === "all" || (edF.art === "noart" ? !c.image : !!c.image))
      .filter(c => STAT_DEFS.every(s => edF[s.key] === null || (c[s.key] || 0) === edF[s.key]))
      .sort(sortFns[edF.sort] || sortFns.id);
  }, [cardPool, cardSetMap, edF]);

  const ownedCardPool = useMemo(() => cardPool.filter(c => (coll[c.id] || 0) > 0), [cardPool, coll]);

  const addLog = useCallback(m => setLog(p => [...p.slice(-60), m]), []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  // Persist via backend API
  const API = "/api";
  const uploadFile = async (f, type = "image") => {
    if (type === "image") {
      try {
        const check = await fetch(`${API}/images/exists?filename=${encodeURIComponent(f.name)}`);
        if (check.ok) {
          const { exists, path } = await check.json();
          if (exists) return path; // already in public/images — just assign
          if (!window.confirm(`"${f.name}" is not in public/images yet. Upload it now?`)) return null;
          // Confirmed new upload — preserve original filename so it's reusable
          const fd = new FormData(); fd.append("file", f); fd.append("use_original_name", "true");
          const r = await fetch(`${API}/upload/image`, { method: "POST", body: fd });
          if (r.ok) { const d = await r.json(); return d.path; }
          return null;
        }
      } catch (e) { console.error("Image check failed", e); }
    }
    const fd = new FormData(); fd.append("file", f);
    try {
      const r = await fetch(`${API}/upload/${type}`, { method: "POST", body: fd });
      if (r.ok) { const d = await r.json(); return d.path; }
    } catch (e) { console.error("Upload failed", e); }
    return null;
  };

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
          if (s.audio_enabled !== undefined) setAudioEnabled(s.audio_enabled);
          if (s.settings) setSettings(s.settings);
          console.log(`[Trinity] Loaded state from backend`);
        } else { console.warn("[Trinity] Backend returned", r.status); }
      } catch (e) { console.warn("[Trinity] Backend not reachable:", e.message); }
      setDbR(true);
      setLoading(false);
    })();
  }, []);
  useEffect(() => { if ((tab === "create" && forgeMode === "single") || (tab === "editor" && showArtPanel)) refreshImages(); }, [tab, forgeMode, showArtPanel]);
  const cardSaveTimer = useRef(null);
  useEffect(() => {
    if (!dbR) return;
    clearTimeout(cardSaveTimer.current);
    cardSaveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/cards`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cardPool),
        });
        if (r.ok) console.log("[Trinity] Cards saved OK");
        else console.error("[Trinity] Cards save failed:", r.status, await r.text());
      } catch (e) { console.warn("[Trinity] Cards save failed:", e.message); }
    }, 2000);
  }, [cardPool, dbR]);

  const stateSaveTimer = useRef(null);
  useEffect(() => {
    if (!dbR) return;
    clearTimeout(stateSaveTimer.current);
    stateSaveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decks, sets, collection: coll, tokens, settings }),
        });
        if (r.ok) console.log("[Trinity] State saved OK");
        else console.error("[Trinity] State save failed:", r.status, await r.text());
      } catch (e) { console.warn("[Trinity] State save failed:", e.message); }
    }, 800);
  }, [decks, sets, coll, tokens, settings, dbR]);

  useEffect(() => {
    const s = document.createElement("style"); s.textContent = `
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
    @keyframes subtlePulse{0%,100%{opacity:1}50%{opacity:.78}}
    @keyframes tokenGold{0%{color:inherit}30%{color:#c9a84c;text-shadow:0 0 8px #c9a84c88}100%{color:inherit}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes glow{0%,100%{box-shadow:0 0 4px #a8a8b822}50%{box-shadow:0 0 10px #a8a8b844}}
    @keyframes flashAnim{0%{opacity:0;transform:scale(.9)}10%{opacity:1;transform:scale(1.02)}20%{transform:scale(1)}85%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
    @keyframes summonSlam{0%{opacity:0;transform:scale(1.12)}8%{opacity:1;transform:scale(.97)}18%{transform:scale(1.01)}26%{transform:scale(1)}85%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.06)}}
    @keyframes battleFlash{0%{opacity:0;transform:scale(.9)}8%{opacity:1;transform:scale(1.02)}15%{transform:scale(1)}88%{opacity:1}100%{opacity:0}}
    @keyframes battleLoseL{0%{opacity:1;transform:translateX(0) scale(1);filter:brightness(1)}7%{transform:translateX(-11px) scale(1.07) rotate(-3deg);filter:brightness(4)}15%{transform:translateX(9px) scale(1.04) rotate(2deg);filter:brightness(1.5)}23%{transform:translateX(-7px) rotate(-2deg)}31%{transform:translateX(5px) rotate(1deg)}40%{opacity:1;transform:translateX(0) scale(1) rotate(0);filter:brightness(1)}58%{opacity:0;transform:translateX(-55px) scale(.55) rotate(-14deg);filter:brightness(.3)}100%{opacity:0;transform:translateX(-80px) scale(.4) rotate(-20deg)}}
    @keyframes battleLoseR{0%{opacity:1;transform:translateX(0) scale(1);filter:brightness(1)}7%{transform:translateX(11px) scale(1.07) rotate(3deg);filter:brightness(4)}15%{transform:translateX(-9px) scale(1.04) rotate(-2deg);filter:brightness(1.5)}23%{transform:translateX(7px) rotate(2deg)}31%{transform:translateX(-5px) rotate(-1deg)}40%{opacity:1;transform:translateX(0) scale(1) rotate(0);filter:brightness(1)}58%{opacity:0;transform:translateX(55px) scale(.55) rotate(14deg);filter:brightness(.3)}100%{opacity:0;transform:translateX(80px) scale(.4) rotate(20deg)}}
    @keyframes cinemaIn{0%{opacity:0;transform:translateX(-16px) scale(.96)}10%{opacity:1;transform:translateX(0) scale(1)}82%{opacity:1}100%{opacity:0;transform:scale(.98)}}
    @keyframes cinemaBattleIn{0%{opacity:0;transform:scale(.92)}8%{opacity:1;transform:scale(1.01)}14%{transform:scale(1)}85%{opacity:1}100%{opacity:1}}
    @keyframes cinemaWinUp{0%,25%{transform:translateY(0);opacity:1;filter:brightness(1)}55%{filter:brightness(1.3)}100%{transform:translateY(-140%);opacity:0;filter:brightness(1.6)}}
    @keyframes cinemaLoseDown{0%,25%{transform:translateY(0);opacity:1;filter:brightness(1)}55%{filter:brightness(.4)}100%{transform:translateY(140%);opacity:0;filter:brightness(.2)}}
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

  const handleKeys = useCallback((e) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if ((tab !== "play" && tab !== "duel") || !game || game.ph !== "playing" || aiR) return;

    // In multiplayer, only the active player can use shortcuts
    if (mMode && game.turn !== curR) return;

    const k = e.key.toLowerCase();
    if (k === "d") { drawCard(); }
    else if (k === "e") { endTurn(); }
    else if (k === "q") { forfeit(); }
    else if (k === "p") { setShowPit(p => !p); }
    else if (k === "escape" || k === "c") { clr(); }
    else if (k === "b") { if (mode === "bless" || mode === "curse") playBC(mode); }
    else if (k === "s") { if (mode === "chooseStat") resolveTap("soul"); else if (mode === "bless" || mode === "curse") doSetTrap(); else if (mode === "equip") doSetEquip(); else if (mode === "playField") doSetField(); }
    else if (k === "w") { if (mode === "chooseStat") resolveTap("will"); }
    else if (k === "m") { if (mode === "chooseStat") resolveTap("mind"); }
    // Number keys 1-9: select hand card
    else if (/^[1-9]$/.test(k)) {
      const idx = parseInt(k) - 1;
      const mhk = curR === "player" ? "pH" : "aH";
      if (game[mhk] && idx < game[mhk].length) selectHand(idx);
    }
  }, [tab, game, aiR, drawCard, endTurn, forfeit, mode, clr, doSetTrap, doSetEquip, doSetField, playBC, resolveTap, mMode, mRole, curR, selectHand]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [handleKeys]);

  // Game engine — ownership-aware C shift helper
  // Winner pushes C toward their own win condition.
  // Player light: player wins push +C, AI wins push -C
  // Player dark: player wins push -C, AI wins push +C
  function combatC(g, dmg, winningStat, winnerOwner, battleOpts, atkCard, defCard, atkWon, logPrefix, statKey) {
    const playerDir = g.pRole === "light" ? 1 : -1;
    const cShift = dmg * (winnerOwner === "player" ? playerDir : -playerDir);

    const absShift = Math.abs(cShift);
    const label = cShift > 0 ? `+${absShift}C` : `−${absShift}C`;
    const color = cShift > 0 ? T.bless : T.curse;

    const prevC = g.c;
    const nextC = Math.max(-C_MAX, Math.min(C_MAX, prevC + cShift));
    const crossedZero = (prevC > 0 && nextC < 0) || (prevC < 0 && nextC > 0) || (prevC !== 0 && nextC === 0);

    if (crossedZero) {
      playSfx(cShift > 0 ? "revenance-pos" : "revenance-neg");
    } else if (statKey) {
      playSfx(`battle-${statKey[0]}`);
    }

    enqF(label, { color, border: color, icon: cShift > 0 ? "A" : "C", iconFont: FONT_TITLE, ...battleOpts, atkWon });
    applyC(g, cShift, true); // true to skip internal revenance sound
    addLog(`${logPrefix} (${label} Meter)`);
  }

  function resolveCombat(aS, dS, stat) {
    const aV = Math.abs(aS[stat]), dV = Math.abs(dS[stat]);
    if (aV === dV) return { winner: "tie", dmg: 0 };
    if (aV > dV) return { winner: "attacker", dmg: aV - dV, winningStat: aS[stat] };
    return { winner: "defender", dmg: dV - aV, winningStat: dS[stat] };
  }
  function applyC(g, amt, skipSfx) {
    const prev = g.c;
    const next = Math.max(-C_MAX, Math.min(C_MAX, prev + amt));
    g.c = next;
    if (!g.cMoved && next !== prev) g.cMoved = true;

    const crossedZero = (prev > 0 && next < 0) || (prev < 0 && next > 0) || (prev !== 0 && next === 0);
    if (crossedZero && !skipSfx) {
      playSfx("revenance");
      if (amt < 0 && g.pD.length && g.pRole === "light") { g.pH.push(...g.pD.splice(0, Math.min(2, g.pD.length))); addLog("⟐ AWAKENING"); }
      else if (amt > 0 && g.aD.length && g.pRole === "light") { g.aH.push(...g.aD.splice(0, Math.min(2, g.aD.length))); addLog("⟐ REVENANCE"); }
      else if (amt > 0 && g.pD.length && g.pRole === "dark") { g.pH.push(...g.pD.splice(0, Math.min(2, g.pD.length))); addLog("⟐ AWAKENING"); }
      else if (amt < 0 && g.aD.length && g.pRole === "dark") { g.aH.push(...g.aD.splice(0, Math.min(2, g.aD.length))); addLog("⟐ REVENANCE"); }
      // Slow down the sequence slightly when these trigger
      if (fB.current) fB.current = true; // Wait for flash
    }

    // Victory Conditions
    const winLight = g.c >= C_MAX;
    const winDark = g.c <= -C_MAX;

    if (winLight) {
      g.ph = "over";
      if (g.pRole === "light") { g.win = "player"; setTokens(t => t + TOKENS_PER_WIN); enqF("ENLIGHTENMENT", { color: "#e8e8f8", border: "#e8e8f8", icon: jp ? "悟" : "E" }); }
      else { g.win = "ai"; enqF("DEFEAT", { color: T.curse, border: T.curse }); }
      setTimeout(() => saveGameLog(g), 0);
    } else if (winDark) {
      g.ph = "over";
      if (g.pRole === "dark") { g.win = "player"; setTokens(t => t + TOKENS_PER_WIN); enqF("OBLIVION", { color: "#e8e8f8", border: "#e8e8f8", icon: jp ? "虚" : "O" }); }
      else { g.win = "ai"; enqF("DEFEAT", { color: T.curse, border: T.curse }); }
      setTimeout(() => saveGameLog(g), 0);
    }
  }
  function stemFor(image) {
    if (!image) return null;
    return image.replace(/^\/images\//, "").replace(/\.[^.]+$/, "");
  }
  function videoFor(card) {
    if (!card) return null;
    if (card.video) return card.video; // explicit legacy field
    const stem = stemFor(card.image);
    return stem ? (videoCacheRef.current[stem] ?? null) : null;
  }
  async function resolveVideoCache(cards) {
    const stems = [...new Set(cards.map(c => stemFor(c.image)).filter(s => s && !(s in videoCacheRef.current)))];
    if (!stems.length) return;
    try {
      const r = await fetch(`${API}/videos/resolve-batch?stems=${stems.join(",")}`);
      if (r.ok) Object.assign(videoCacheRef.current, await r.json());
    } catch {}
  }
  function toPit(card, owner) { setPit(prev => ({ ...prev, [owner]: [...prev[owner], card] })); setRecentPit(prev => [{ card, owner, t: Date.now() }, ...prev].slice(0, 3)); }
  // Shuffles the pit back into the deck when the deck runs dry. Mutates g in place.
  function reshufflePit(g, role) {
    const dk = role === "player" ? "pD" : "aD";
    if (g[dk].length > 0) return;
    const cards = pit[role];
    if (!cards.length) return;
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    g[dk] = shuffled;
    setPit(p => ({ ...p, [role]: [] }));
    addLog(`↺ ${role === "player" ? "Your" : "Opp"} pit recycled (${shuffled.length} cards)`);
    enqF("RECYCLE", { color: T.silverDim, border: T.silverBright, icon: "↺", sub: `${shuffled.length} cards` });
  }
  function chkTraps(g, r, c, mover, movingCell, isFieldTrans = false) {
    const opp = mover === "player" ? "ai" : "player";
    adj(r, c).forEach(([ar, ac]) => {
      const cell = g.bd[ar]?.[ac];
      /* NOTE: Removed original Blessing/Curse proximity triggers to allow for
       "defusing" via moving over. Proximity triggers can be added back for
       specific "Ambush" entity types later if desired. */
    });

    const landCell = g.bd[r][c];
    if (!landCell) return false;

    // Opponent's face-down field — entity destroyed, field activates face-up
    if (landCell.fd && landCell.cd?.type === "field" && landCell.ow === opp) {
      playSfx("diffuse");
      enqF("FIELD ACTIVATED", { color: TC.field, border: TC.field, icon: "F", image: landCell.cd.image });
      addLog(`▣ Field Activated: ${landCell.cd.name || "Field"} — ${movingCell?.cd?.name || "Being"} destroyed`);
      if (movingCell) toPit(movingCell.cd, mover);
      g.bd[r][c] = { ...landCell, fd: false }; // field flips face-up, stays on board
      return true; // entity was consumed
    }

    // Opponent's spell trap — defuse
    if (landCell.fd && landCell.ow === opp && (landCell.cd.type === "bless" || landCell.cd.type === "curse")) {
      playSfx("diffuse");
      enqF("TRAP DEFUSED", { color: T.textDim, border: T.silverDim, icon: "T" });
      addLog(`⊘ Trap Defused: ${landCell.cd.name || "Trap"}`);
      toPit(landCell.cd, opp);
      g.bd[r][c] = null;
      return false;
    }

    // Own set equip (primed) — apply to moving entity
    if (landCell.fd && landCell.cd?.type === "equip" && landCell.ow === mover && (landCell.prm || 0) <= 0) {
      if (movingCell) {
        movingCell.ib = { ...movingCell.ib };
        STAT_DEFS.forEach(s => { movingCell.ib[s.key] = (movingCell.ib[s.key] || 0) + (landCell.cd[s.key] || 0); });
      }
      playSfx("action");
      enqF("EQUIP ACTIVATED", { color: TC.equip, border: TC.equip, icon: "E", image: landCell.cd.image });
      addLog(`⊕ Equip Activated: ${landCell.cd.name || "Equip"}`);
      toPit(landCell.cd, mover);
      g.bd[r][c] = null;
      return false;
    }

    // Opponent's set equip — diffuse (no effect)
    if (landCell.fd && landCell.cd?.type === "equip" && landCell.ow === opp) {
      playSfx("diffuse");
      enqF("EQUIP DIFFUSED", { color: T.textDim, border: T.silverDim, icon: "E" });
      addLog(`⊘ Equip Diffused: ${landCell.cd.name || "Equip"}`);
      toPit(landCell.cd, opp);
      g.bd[r][c] = null;
      return false;
    }

    // Field-transcendent entity landing on face-up terrain — diffuse it
    if (!landCell.fd && landCell.cd?.type === "field" && isFieldTrans) {
      playSfx("diffuse");
      enqF("FIELD DIFFUSED", { color: TC.field, border: TC.field, icon: "F" });
      addLog(`✡ Field Diffused`);
      toPit(landCell.cd, landCell.ow);
      g.bd[r][c] = null;
    }
    return false;
  }
  function flipSets(g, ow) {
    // Decrement priming for the current player's traps
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cl = g.bd[r][c];
        if (cl?.ow === ow) {
          if (cl.fd && cl.prm > 0) cl.prm--;
          if (cl.summonedThisTurn) delete cl.summonedThisTurn;
        }
      }
    }
  }

  function checkFieldFreeings(g) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = g.bd[r][c];
        if (!cell || !cell.fd || cell.cd?.type !== "field") continue;
        const opp = cell.ow === "player" ? "ai" : "player";
        const adjEnemies = adjFull(r, c).filter(([ar, ac]) => {
          const n = g.bd[ar]?.[ac];
          return n && n.ow === opp && n.cd?.type === "being" && !n.fd;
        });
        if (adjEnemies.length >= 4) {
          enqF("FIELD FREED", { color: TC.field, border: TC.field, icon: "F" });
          addLog(`✕ Field Freed: ${cell.cd.name || "Field"}`);
          toPit(cell.cd, cell.ow);
          g.bd[r][c] = null;
        }
      }
    }
  }

  function chkPressure(g) {
    if (g.ph === "over" || g.tn < 3) return;
    let pCount = 0, aCount = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cl = g.bd[r][c];
      if (cl?.cd.type === "being" && !cl.fd) {
        if (cl.ow === "player") pCount++; else aCount++;
      }
    }
    const diff = pCount - aCount;
    if (diff === 0) return;
    const playerDir = g.pRole === "light" ? 1 : -1;
    const shift = -Math.sign(diff) * playerDir;
    if (Math.abs(g.c + shift) >= C_MAX) return;
    const label = shift > 0 ? `+${shift}` : `${shift}`;
    addLog(`✧ CATCH-UP: ${label}C (${pCount}v${aCount})`);
    applyC(g, shift);
  }

  function startGame() {
    forfeitRef.current = false;
    playSfx("judgment");
    const pIds = decks[selDI]?.cards || []; const aIds = decks[oppDI]?.cards || [];
    const pD = shuffle(pIds.map(id => gc(id, cardPool)).filter(Boolean));
    const aD = shuffle(aIds.map(id => gc(id, cardPool)).filter(Boolean));
    resolveVideoCache([...pD, ...aD]); // fire-and-forget; populates cache before first play
    const pDk = decks[selDI];
    const pMag = getDeckMagnitude(pDk, cardPool);
    const pRole = pMag < 0 ? "dark" : "light";
    const turn = Math.random() < 0.5 ? "player" : "ai";
    const startG = {
      bd: Array.from({ length: 5 }, () => Array(5).fill(null)),
      pH: pD.splice(0, HAND_SIZE), aH: aD.splice(0, HAND_SIZE),
      pD, aD, c: 0, cMoved: false, turn, act: actionsPerTurn, tn: 1, ph: "playing", win: null, pRole, flips: 0, seq: 0
    };

    if (tab === "duel") {
      ws.current.send(JSON.stringify({ type: "start_game", state: startG }));
    } else {
      setActionLog([]); gameStartRef.current = Date.now();
      setGame(startG);
      setMMode(false); // Ensure mMode is false for local play
      setPit({ player: [], ai: [] }); clr(); setLog([`0C. ${turn === "player" ? "Your" : "Opponent"} turn.`]);
      if (turn === "ai") {
        setAiR(true);
        setTimeout(() => runAI(startG, 0), 1000);
      }
      requestAnimationFrame(() => enqF("Genesis", { color: T.silverBright, border: T.silver, icon: jp ? "創" : "G" }));
    }
  }

  const isMyTurn = useCallback(() => {
    if (!game || game.ph !== "playing") return false;
    return game.turn === curR;
  }, [game, curR]);

  // Auto-advance: when the active player runs out of actions, end the turn automatically
  useEffect(() => {
    if (!game || game.ph !== "playing" || aiR) return;
    if (game.act <= 0 && game.turn === curR) {
      const t = setTimeout(() => endTurnRef.current?.(), 1800);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.act, game?.turn, game?.ph, aiR, curR]);

  function clr() { setSelH(null); setSelB(null); setHl([]); setMode(null); setTapTgt(null); setInspCell(null); }
  function forfeit() {
    // Kill all animations instantly
    forfeitRef.current = true;
    fQ.current = []; fB.current = false; setFlash(null);
    if (mMode) {
      ws.current.send(JSON.stringify({ type: "reset" }));
    }
    setGame(null); setLog([]); setAiR(false); setPit({ player: [], ai: [] }); setRecentPit([]); setInspCell(null); setMMode(false);
  }

  function drawCard() {
    if (!game || game.ph !== "playing" || !isMyTurn() || game.act <= 0) return;
    const mr = curR;
    const mdk = mr === "player" ? "pD" : "aD";
    const mhk = mr === "player" ? "pH" : "aH";
    const g = { ...game, [mdk]: [...game[mdk]], [mhk]: [...game[mhk]], act: game.act - 1 };
    reshufflePit(g, mr);
    if (!g[mdk].length) return;

    playSfx("draw");
    const c = g[mdk].shift(); g[mhk].push(c);
    addLog(`Draw: ${c.name || "Card"}`);

    updateGame(g, { type: ACTION_TYPES.DRAW }); clr();
  }
  function selectHand(idx) {
    if (selH === idx) { clr(); return; }  // re-click same card = deselect
    const mr = curR;
    if (!game || game.turn !== mr || game.ph !== "playing") return;
    if (selB !== null) clr();  // clicking a hand card while a board entity is selected — clear first
    const mhk = mr === "player" ? "pH" : "aH";
    const c = game[mhk][idx]; setSelH(idx); setSelB(null);
    if (c.type === "being") {
      if (game.act <= 0) return;
      if (TRIBUTE_SUMMON_ENABLED && Math.abs(aura(c)) > 5) {
        // Tribute summon: highlight own board entities to sacrifice
        const cells = [];
        for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
          const cl = game.bd[r][col];
          if (cl?.ow === mr && cl.cd.type === "being" && !cl.fd) cells.push([r, col]);
        }
        setHl(cells); setMode("tribute"); return;
      }
      const cells = [];
      if (mr === "player") {
        for (let r = 3; r < 5; r++) for (let col = 0; col < 5; col++) if (!game.bd[r][col]) cells.push([r, col]);
      } else {
        for (let r = 0; r < 2; r++) for (let col = 0; col < 5; col++) if (!game.bd[r][col]) cells.push([r, col]);
      }
      // Field overlap: any unoccupied cell adjacent to 2+ face-up fields
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        if (!game.bd[r][col] && countAdjFaceUpFields(r, col, game.bd) >= 2 && !cells.some(([cr, cc]) => cr === r && cc === col))
          cells.push([r, col]);
      }
      // Aura-zero entity (net soul+mind+will = 0): can purge terrain and traps anywhere on the board (not set equips)
      if (isTranscendent(c)) {
        for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
          const cell = game.bd[r][col];
          if (cell && (cell.cd?.type === "field" || (cell.fd && cell.cd?.type !== "equip"))) cells.push([r, col]);
        }
      }
      // Void being (0/0/0): free placement on any empty cell
      if (isVoid(c)) {
        for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++)
          if (!game.bd[r][col] && !cells.some(([cr, cc]) => cr === r && cc === col))
            cells.push([r, col]);
      }
      // Beacon: any empty cell in 8-dir around a friendly void being already on board
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        const cl = game.bd[r][col];
        if (cl?.ow === mr && cl.cd.type === "being" && !cl.fd && isVoid(cl.cd)) {
          for (const [ar, ac] of adjFull(r, col))
            if (!game.bd[ar][ac] && !cells.some(([cr, cc]) => cr === ar && cc === ac))
              cells.push([ar, ac]);
        }
      }
      setHl(cells); setMode("summon");
    }
    else if (c.type === "bless" || c.type === "curse") { if (game.act <= 0) return; setHl([]); setMode(c.type); }
    else if (c.type === "field") {
      if (game.act < 1) { setHl([]); setMode("playField"); return; } // no actions — can only set (free)
      const cells = [];
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        if (!game.bd[r][col] && !hasAdjField(r, col, game.bd)) cells.push([r, col]);
      }
      setHl(cells); setMode("playField");
    }
    else if (c.type === "equip") {
      if (game.act <= 0) return;
      const cells = [];
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        const cl = game.bd[r][col];
        if (cl?.ow === mr && cl.cd.type === "being") cells.push([r, col]);
      }
      setHl(cells); setMode("equip");
    }
  }
  function playBC(type) {
    if (!game || selH === null) return;
    const mr = curR;
    const mhk = mr === "player" ? "pH" : "aH";
    const c = game[mhk][selH]; const pwr = cPwr(c); const cost = game.c === 0 && game.cMoved ? 0 : 1;
    if (game.act < cost) return;
    const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(r => [...r]) };
    g[mhk].splice(selH, 1); g.act -= cost;
    playSfx("action");
    if (type === "bless") { enqF(`+${pwr}C`, { color: T.bless, border: T.bless, icon: "△", image: c.image, video: videoFor(c) }); applyC(g, pwr); addLog(`Play: ${c.name || "Bless"} (+${pwr}C)`); }
    else { enqF(`−${pwr}C`, { color: T.curse, border: T.curse, icon: "▽", image: c.image, video: videoFor(c) }); applyC(g, -pwr); addLog(`Play: ${c.name || "Curse"} (−${pwr}C)`); }
    const draws = pwr === 1 ? 1 : 0;
    const mdk = mr === "player" ? "pD" : "aD";
    g[mdk] = [...g[mdk]];
    for (let di = 0; di < draws; di++) {
      if (!g[mdk].length) reshufflePit(g, mr);
      if (!g[mdk].length) break;
      const drawn = g[mdk].shift();
      g[mhk].push(drawn);
      playSfx("draw");
      addLog(`Draw: ${drawn.name || "Card"} (free)`);
    }
    toPit(c, mr); updateGame(g, { type: ACTION_TYPES.PLAY_BC, cardType: type, handIdx: selH, role: mr }); clr();
  }
  function doSetTrap() {
    if (!game || selH === null) return;
    const cells = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (!game.bd[r][c]) cells.push([r, c]);
    }
    setHl(cells); setMode("setTrap");
  }
  function doSetEquip() {
    if (!game || selH === null) return;
    const mr = curR; const mhk = mr === "player" ? "pH" : "aH";
    if (game[mhk][selH]?.type !== "equip") return;
    if (game.act !== 1) { addLog("Can only set equip as your last action."); return; }
    const cells = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!game.bd[r][c]) cells.push([r, c]);
    setHl(cells); setMode("setEquip");
  }
  function doSetField() {
    if (!game || selH === null) return;
    const cells = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (!game.bd[r][c] && !hasAdjField(r, c, game.bd)) cells.push([r, c]);
    }
    setHl(cells); setMode("setField");
  }
  function doPlayField() {
    if (!game || selH === null || game.act < 1) return;
    const cells = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (!game.bd[r][c] && !hasAdjField(r, c, game.bd)) cells.push([r, c]);
    }
    setHl(cells); setMode("playField");
  }
  function boardClick(vr, vc) {
    const mr = curR;
    const or = mr === "player" ? "ai" : "player";
    const r = (mr === "ai") ? 4 - vr : vr;
    const c = (mr === "ai") ? 4 - vc : vc;

    if (!game || game.turn !== mr || game.ph !== "playing" || (mr === "player" && aiR)) return;
    const mhk = mr === "player" ? "pH" : "aH";
    const isH = hl.some(([hr, hc]) => hr === r && hc === c);
    const cell = game.bd[r][c];

    if (mode === "setTrap" && selH !== null && isH) {
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = g[mhk].splice(selH, 1)[0];
      g.bd[r][c] = { cd: card, ow: mr, fd: true, prm: 1 };
      playSfx("draw");
      enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "▼", image: card.image });
      addLog(`Set: Trap`);
      updateGame(g, { type: ACTION_TYPES.SET_TRAP, row: r, col: c, handIdx: selH }); clr(); return;
    }
    if (mode === "setEquip" && selH !== null && isH) {
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = g[mhk].splice(selH, 1)[0];
      g.bd[r][c] = { cd: card, ow: mr, fd: true, prm: 1 };
      playSfx("draw");
      enqF("SET EQUIP", { color: TC.equip, border: TC.equip, icon: "▼", image: card.image });
      addLog(`Set: Equip`);
      updateGame(g, { type: ACTION_TYPES.SET_EQUIP, row: r, col: c, handIdx: selH }); clr(); return;
    }
    if (mode === "tribute" && selH !== null && isH) {
      // Selected a tribute entity — tribute summon can land anywhere empty (tribute cell frees up too)
      const summonCells = [];
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++)
        if (!game.bd[row][col] || (row === r && col === c)) summonCells.push([row, col]);
      setSelB([r, c]); setHl(summonCells); setMode("tributePlace"); return;
    }
    if (mode === "tributePlace" && selH !== null && selB !== null && isH) {
      const cost = 1;
      if (game.act < cost) return;
      const [tr, tc] = selB;
      const tributeCell = game.bd[tr][tc];
      if (!tributeCell) { clr(); return; }
      playSfx("action");
      const gInterim = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = gInterim[mhk].splice(selH, 1)[0];
      gInterim.act -= cost;
      gInterim.bd[tr][tc] = null;
      toPit(tributeCell.cd, mr);
      setGame({ ...gInterim, seq: (gInterim.seq || 0) + 1 });
      enqF("TRIBUTE", { color: T.legendary, border: T.legendary, icon: "✦", image: card.image, video: videoFor(card) });
      addLog(`Tribute: ${tributeCell.cd?.name || "Being"} → ${card.name || "Being"}`);
      clr();
      setTimeout(() => {
        const gFull = { ...gInterim, bd: gInterim.bd.map(row => [...row]) };
        gFull.bd[r][c] = { cd: card, ow: mr, fd: false, ib: { soul: 0, mind: 0, will: 0 } };
        updateGame(gFull, { type: ACTION_TYPES.TRIBUTE_SUMMON, row: r, col: c, handIdx: selH, tribRow: tr, tribCol: tc });
      }, 1100);
      return;
    }
    if (mode === "playField" && selH !== null && isH) {
      if (game.act < 1) return;
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = g[mhk].splice(selH, 1)[0];
      g.act -= 1;
      g.bd[r][c] = { cd: card, ow: mr, fd: false, ib: { soul: 0, mind: 0, will: 0 } };
      playSfx("action");
      enqF("FIELD", { color: TC.field, border: TC.field, icon: "▣", image: card.image, video: videoFor(card) });
      addLog(`Field: ${card.name || "Field"} (played)`);
      updateGame(g, { type: ACTION_TYPES.TERRAIN, row: r, col: c, handIdx: selH, faceUp: true }); clr(); return;
    }
    if ((mode === "summon" || mode === "setField") && selH !== null && isH) {
      const isSummon = mode === "summon";
      const cost = isSummon ? 1 : 0;
      if (isSummon && game.act < 1) return;
      playSfx("action");
      const existing = game.bd[r][c];
      const isPurge = isSummon && existing && (existing.cd?.type === "field" || (existing.fd && existing.cd?.type !== "equip"));
      // Interim state: action spent + card removed from hand, but entity NOT yet on board
      const gInterim = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = gInterim[mhk].splice(selH, 1)[0];
      gInterim.act -= cost;
      if (isPurge) gInterim.bd[r][c] = null; // clear terrain/trap immediately in interim
      setGame({ ...gInterim, seq: (gInterim.seq || 0) + 1 });
      if (isPurge) {
        toPit(existing.cd, existing.ow);
        enqF("PURGE", { color: TC.field, border: TC.field, icon: "✕", image: card.image });
        addLog(`Purge: ${existing.cd?.name || existing.cd?.type}`);
      } else {
        enqF(isSummon ? "SUMMON" : "FIELD", { color: T.silver, border: TC[card.type], image: card.image, video: videoFor(card) });
        addLog(`${isSummon ? "Summon" : "Field"}: ${card.name || card.type}`);
      }
      clr();
      // Place entity on board as animation fades (~2/3 through the 1800ms flash)
      setTimeout(() => {
        const gFull = { ...gInterim, bd: gInterim.bd.map(row => [...row]) };
        gFull.bd[r][c] = isSummon
          ? { cd: card, ow: mr, fd: false, ib: { soul: 0, mind: 0, will: 0 } }
          : { cd: card, ow: mr, fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } };
        updateGame(gFull, { type: isSummon ? ACTION_TYPES.SUMMON : ACTION_TYPES.TERRAIN, row: r, col: c, handIdx: selH });
      }, 1100);
      return;
    }
    if (mode === "equip" && selH !== null && isH) {
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const item = g[mhk].splice(selH, 1)[0]; const ncell = { ...g.bd[r][c] };
      playSfx("action");
      STAT_DEFS.forEach(s => { ncell.ib[s.key] = (ncell.ib?.[s.key] || 0) + (item[s.key] || 0); });
      g.bd[r][c] = ncell; g.act--;
      enqF("EQUIP", { color: T.item, border: T.item, icon: "⊕", image: item.image });
      addLog(`Equip: ${item.name || item.type}`);
      toPit(item, mr);
      updateGame(g, { type: ACTION_TYPES.EQUIP, row: r, col: c, handIdx: selH }); clr(); return;
    }
    if (cell?.ow === mr && cell.fd && cell.cd?.type !== "equip" && !mode) {
      if (game.flips >= 2) { addLog("Max 2 flips per turn reached."); return; }
      const ready = (cell.prm || 0) <= 0;
      if (!ready) { addLog(`Wait. Trap still priming... (${cell.prm} left)`); return; }

      playSfx("action");
      const g = { ...game, bd: game.bd.map(row => [...row]), flips: game.flips + 1 };
      if (cell.cd.type === "field") {
        // Field flips face-up and stays on board as terrain buff
        g.bd[r][c] = { ...cell, fd: false };
        enqF("FIELD", { color: TC.field, border: TC.field, icon: "▣", image: cell.cd.image, video: videoFor(cell.cd) });
        addLog(`Field: ${cell.cd.name || "Field"} activated`);
      } else {
        const pwr = cPwr(cell.cd);
        const isB = cell.cd.type === "bless";
        if (isB) { enqF(`+${pwr}C`, { color: T.bless, border: T.bless, icon: "△", image: cell.cd.image, video: videoFor(cell.cd) }); applyC(g, pwr); addLog(`Trigger: ${cell.cd.name || "Bless"} (+${pwr}C)`); }
        else { enqF(`−${pwr}C`, { color: T.curse, border: T.curse, icon: "▽", image: cell.cd.image, video: videoFor(cell.cd) }); applyC(g, -pwr); addLog(`Trigger: ${cell.cd.name || "Curse"} (−${pwr}C)`); }
        toPit(cell.cd, mr); g.bd[r][c] = null;
      }
      updateGame(g, { type: ACTION_TYPES.FLIP, row: r, col: c }); clr(); return;
    }

    if (cell?.ow === mr && cell.cd.type === "being" && !cell.fd && mode !== "chooseStat") {
      setSelB([r, c]); setSelH(null); setInspCell([r, c]);
      const effS = getEff(cell.cd, game.bd, r, c, cell.ib);
      const isT = aura(effS) === 0;
      const isFieldTrans = isT && aura(cell.cd) !== 0;
      const moveA = adj(r, c, isT ? 2 : 1).filter(([tr, tc]) => canReach(r, c, tr, tc, game.bd));
      const atkA = isT ? adjFull(r, c) : adj(r, c, 1);
      setHl([
        ...moveA.filter(([ar, ac]) => { const d = game.bd[ar][ac]; if (!d) return true; if (d.fd && d.ow === mr && d.cd?.type === "equip" && (d.prm || 0) > 0) return false; if (d.fd) return true; return isFieldTrans && d.cd?.type === "field"; }),
        ...atkA.filter(([ar, ac]) => { const t = game.bd[ar]?.[ac]; return t && t.ow === or && t.cd.type === "being" && !t.fd; })
      ]);
      setMode("moveOrTap"); return;
    }
    // Inspect: click any occupied cell when no mode is active
    if (cell && !mode && !selH) { setInspCell([r, c]); return; }
    if (mode === "moveOrTap" && selB && isH) {
      const [sr, sc] = selB;
      const dest = game.bd[r][c];
      const movingEnt0 = game.bd[sr][sc];
      const movingEffS0 = movingEnt0 ? getEff(movingEnt0.cd, game.bd, sr, sc, movingEnt0.ib) : null;
      const isMovingFieldTrans = movingEffS0 && aura(movingEffS0) === 0 && aura(movingEnt0.cd) !== 0;
      const isTerrainTarget = dest && !dest.fd && dest.cd?.type === "field";
      if (!dest || dest.fd || (isMovingFieldTrans && isTerrainTarget)) {
        if (game.act <= 0) return;
        const g = { ...game, bd: game.bd.map(row => [...row]) };
        const movingEnt = g.bd[sr][sc];
        g.bd[sr][sc] = null;
        const consumed = chkTraps(g, r, c, mr, movingEnt, isMovingFieldTrans);
        if (!consumed) g.bd[r][c] = movingEnt;
        checkFieldFreeings(g);
        g.act--; updateGame(g, { type: ACTION_TYPES.MOVE, fromRow: sr, fromCol: sc, row: r, col: c }); clr();
      }
      else if (game.bd[r][c]?.ow === or) { if (game.act <= 0) return; setTapTgt([r, c]); setMode("chooseStat"); setHl([]); }
      return;
    }
    // Click-off: clicking any non-handled cell while something is selected cancels the selection
    if (mode || selH !== null || selB !== null) clr();
  }
  function resolveTap(stat) {
    if (!game || !selB || !tapTgt) return; const [ar, ac] = selB; const [dr, dc] = tapTgt;
    const atk = game.bd[ar][ac]; const def = game.bd[dr][dc]; if (!atk || !def) return;
    const aS = getEff(atk.cd, game.bd, ar, ac, atk.ib); const dS = getEff(def.cd, game.bd, dr, dc, def.ib);
    const result = resolveCombat(aS, dS, stat);
    const g = { ...game, bd: game.bd.map(row => [...row]) }; g.act--;
    const battleOpts = { atkCard: atk.cd, defCard: def.cd, sub: `${stat.toUpperCase()} |${aS[stat]}| vs |${dS[stat]}|` };
    const aVal = Math.abs(aS[stat]); const dVal = Math.abs(dS[stat]);
    if (result.winner === "attacker") {
      // Player's entity won — ownerFactor = +1 (player)
      g.bd[dr][dc] = null; toPit(def.cd, "ai");
      combatC(g, result.dmg, result.winningStat, "player", battleOpts, atk.cd, def.cd, true,
        `⚔ ${atk.cd.name || "Atk"} |${aVal}| > ${def.cd.name || "Def"} |${dVal}|`, stat);
    } else if (result.winner === "defender") {
      // AI's entity won — ownerFactor = -1 (ai)
      g.bd[ar][ac] = null; toPit(atk.cd, "player");
      combatC(g, result.dmg, result.winningStat, "ai", battleOpts, atk.cd, def.cd, false,
        `⚔ ${atk.cd.name || "Atk"} |${aVal}| < ${def.cd.name || "Def"} |${dVal}|`, stat);
    } else {
      g.bd[ar][ac] = null; g.bd[dr][dc] = null;
      toPit(atk.cd, "player"); toPit(def.cd, "ai");
      playSfx(`battle-${stat[0]}`);
      enqF("⚔", { color: T.textDim, border: T.textDim, ...battleOpts, tie: true });
      addLog(`⚔ ${atk.cd.name || "Atk"} |${aVal}| = ${def.cd.name || "Def"} |${dVal}| (tie)`);
    }
    updateGame(g, { type: ACTION_TYPES.ATTACK, atkRow: ar, atkCol: ac, defRow: dr, defCol: dc, stat }); clr();
  }
  function endTurn() {
    if (!game || !isMyTurn() || aiR) return;
    const g = { ...game, bd: game.bd.map(r => [...r]), aH: [...game.aH], aD: [...game.aD], pH: [...game.pH], pD: [...game.pD] };
    const nextTurn = game.turn === "player" ? "ai" : "player";

    g.turn = nextTurn; g.act = actionsPerTurn; g.flips = 0;

    // Auto-draw for next player (reshuffle pit if deck empty)
    const ndk = nextTurn === "player" ? "pD" : "aD";
    const nhk = nextTurn === "player" ? "pH" : "aH";
    if (!g[ndk].length) reshufflePit(g, nextTurn);
    if (g[ndk].length) { g[nhk].push(g[ndk].shift()); playSfx("draw"); }

    flipSets(g, nextTurn); g.tn++;

    if (mMode) {
      updateGame(g, { type: ACTION_TYPES.END_TURN }); clr();
      addLog(`— ${nextTurn === curR ? "Your" : "Opp"} Turn —`);
    } else {
      setGame(g); clr(); addLog("— Opp —"); setAiR(true); setTimeout(() => runAI(g, 0), 600);
    }
  }
  // Keep endTurnRef current so the auto-advance effect always calls the latest version
  endTurnRef.current = endTurn;

  function saveGameLog(g) {
    const payload = {
      version: 1,
      startedAt: gameStartRef.current ? new Date(gameStartRef.current).toISOString() : null,
      endedAt: new Date().toISOString(),
      winner: g?.win ?? null,
      pRole: g?.pRole ?? null,
      finalConviction: g?.c ?? null,
      turns: g?.tn ?? null,
      multiplayer: mMode,
      actions: actionLog,
      narrative: log,
    };
    fetch("http://localhost:4000/api/game-log", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(e => console.warn("[Trinity] Game log save failed:", e.message));
  }

  // ─── AI Planner — pure helpers (no React side-effects) ──────────────────────
  function aiClone(s) {
    return { ...s, bd: s.bd.map(row => row.map(c => c ? { ...c, ib: { ...(c.ib||{}) } } : null)), aH: [...s.aH], pH: [...s.pH], aD: [...s.aD], pD: [...s.pD] };
  }
  function aiApplyC(s, amt) {
    s.c = Math.max(-C_MAX, Math.min(C_MAX, s.c + amt));
    if (s.c >= C_MAX) { s.ph = "over"; s.win = s.pRole === "light" ? "player" : "ai"; }
    else if (s.c <= -C_MAX) { s.ph = "over"; s.win = s.pRole === "dark" ? "player" : "ai"; }
  }
  function aiActions(s) {
    if (s.act <= 0 || s.ph !== "playing") return [];
    const aiPos = s.pRole === "dark", acts = [];
    for (let i = 0; i < s.aH.length; i++) {
      const c = s.aH[i]; if (c.type !== "bless" && c.type !== "curse") continue;
      if (s.act < 1) continue;
      const v = c.type === "bless" ? cPwr(c) : -cPwr(c);
      const nC = Math.max(-C_MAX, Math.min(C_MAX, s.c + v));
      acts.push({ type: "PLAY_SPELL", handIdx: i, card: c, isLethal: (aiPos && nC >= C_MAX) || (!aiPos && nC <= -C_MAX), cVal: v });
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cl = s.bd[r][c]; if (!cl || cl.ow !== "ai" || cl.cd.type !== "being" || cl.fd) continue;
      const aS = getEff(cl.cd, s.bd, r, c, cl.ib);
      for (const [tr, tc] of (aura(aS) === 0 ? adjFull(r, c) : adj(r, c, 1))) {
        const tg = s.bd[tr]?.[tc]; if (!tg || tg.ow !== "player" || tg.cd.type !== "being" || tg.fd) continue;
        if (!canReach(r, c, tr, tc, s.bd)) continue;
        const dS = getEff(tg.cd, s.bd, tr, tc, tg.ib);
        let bStat = null, bVal = -Infinity;
        for (const st of STAT_DEFS) { const res = resolveCombat(aS, dS, st.key); const v2 = res.winner === "attacker" ? res.dmg * 3 + 15 : (res.winner === "tie" ? 0 : -res.dmg - 5); if (v2 > bVal) { bVal = v2; bStat = { stat: st.key, res, val: v2 }; } }
        if (bStat) acts.push({ type: "ATTACK", fromRow: r, fromCol: c, toRow: tr, toCol: tc, ...bStat });
      }
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cl = s.bd[r][c]; if (!cl || cl.ow !== "ai" || cl.cd.type !== "being" || cl.fd) continue;
      const clIsZero = aura(getEff(cl.cd, s.bd, r, c, cl.ib)) === 0;
      for (const [nr, nc] of (clIsZero ? adjFull(r, c) : adj(r, c, 1))) {
        const tgt = s.bd[nr]?.[nc];
        if (tgt && tgt.ow === "ai") continue;
        if (tgt && !tgt.fd && !(clIsZero && tgt.cd?.type === "field")) continue;
        if (cl.summonedThisTurn && nr <= r) continue;
        acts.push({ type: "MOVE", fromRow: r, fromCol: c, toRow: nr, toCol: nc, cl, isDiffuseTerrain: clIsZero && !!tgt && !tgt.fd && tgt.cd?.type === "field" });
      }
    }
    for (let hi = 0; hi < s.aH.length; hi++) {
      const card = s.aH[hi];
      if (card.type === "being") {
        if (TRIBUTE_SUMMON_ENABLED && Math.abs(aura(card)) > 5) {
          for (let tr = 0; tr < 5; tr++) for (let tc = 0; tc < 5; tc++) {
            const trib = s.bd[tr][tc]; if (!trib || trib.ow !== "ai" || trib.cd.type !== "being" || trib.fd) continue;
            for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++)
              if (!s.bd[r][c] || (r === tr && c === tc)) acts.push({ type: "TRIBUTE_SUMMON", handIdx: hi, card, row: r, col: c, tribRow: tr, tribCol: tc });
          }
        } else {
          for (let r = 0; r <= 1; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c });
          // Field overlap: any unoccupied cell adjacent to 2+ face-up fields (outside normal summon zone)
          for (let r = 2; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c] && countAdjFaceUpFields(r, c, s.bd) >= 2) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c });
          if (isTranscendent(card)) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const cl = s.bd[r][c]; if (cl && (cl.cd?.type === "field" || (cl.fd && cl.cd?.type !== "equip"))) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c, isPurge: true }); } }
          // Void being: free placement anywhere empty
          if (isVoid(card)) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c }); }
          // Beacon: empty cells in 8-dir around friendly void beings on board
          for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const cl = s.bd[r][c]; if (cl?.ow === "ai" && cl.cd.type === "being" && !cl.fd && isVoid(cl.cd)) { for (const [ar, ac] of adjFull(r, c)) if (!s.bd[ar][ac]) acts.push({ type: "SUMMON", handIdx: hi, card, row: ar, col: ac }); } }
        }
      }
      else if (card.type === "field") { for (let r = 3; r <= 4; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c] && !hasAdjField(r, c, s.bd)) acts.push({ type: "TERRAIN", handIdx: hi, card, row: r, col: c }); }
      else if (card.type === "equip") {
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const cl = s.bd[r][c]; if (cl && cl.ow === "ai" && cl.cd.type === "being" && !cl.fd) acts.push({ type: "EQUIP", handIdx: hi, item: card, row: r, col: c }); }
        if (s.act === 1 && Math.random() < 0.35) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) acts.push({ type: "SET_EQUIP", handIdx: hi, card, row: r, col: c, bluff: true }); }
      }
      else if ((card.type === "bless" || card.type === "curse")) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) acts.push({ type: "SET_TRAP", handIdx: hi, card, row: r, col: c, bluff: Math.random() < 0.3 }); }
    }
    if (s.aD.length) acts.push({ type: "DRAW" });
    return acts;
  }
  function aiApply(s, a) {
    const pd = s.pRole === "light" ? 1 : -1;
    if (a.type === "PLAY_SPELL") { s.aH.splice(a.handIdx, 1); const v = a.card.type === "bless" ? cPwr(a.card) : -cPwr(a.card); aiApplyC(s, v); s.act -= 1; if (cPwr(a.card) === 1 && s.aD.length) s.aH.push(s.aD.shift()); }
    else if (a.type === "ATTACK") { const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, res } = a; if (res.winner === "attacker") { s.bd[tr][tc] = null; aiApplyC(s, res.dmg * (-pd)); } else if (res.winner === "defender") { s.bd[fr][fc] = null; aiApplyC(s, res.dmg * pd); } s.act--; }
    else if (a.type === "MOVE") { const t = s.bd[a.toRow][a.toCol]; if (t?.ow === "player") s.bd[a.toRow][a.toCol] = null; s.bd[a.toRow][a.toCol] = s.bd[a.fromRow][a.fromCol]; s.bd[a.fromRow][a.fromCol] = null; s.act--; }
    else if (a.type === "SUMMON") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true }; s.act--; }
    else if (a.type === "TRIBUTE_SUMMON") { s.aH.splice(a.handIdx, 1); s.bd[a.tribRow][a.tribCol] = null; s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true }; s.act--; }
    else if (a.type === "TERRAIN") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } }; } // free action
    else if (a.type === "EQUIP") { const item = s.aH.splice(a.handIdx, 1)[0]; const cl = s.bd[a.row][a.col]; if (cl) { cl.ib = { ...cl.ib }; STAT_DEFS.forEach(st => { cl.ib[st.key] = (cl.ib[st.key] || 0) + (item[st.key] || 0); }); } s.act--; }
    else if (a.type === "SET_TRAP") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: true, prm: 1 }; s.act--; }
    else if (a.type === "SET_EQUIP") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: true, prm: 1 }; s.act = 0; }
    else if (a.type === "DRAW") { if (s.aD.length) { s.aH.push(s.aD.shift()); s.act--; } }
  }
  function aiScore(s) {
    if (s.ph === "over") return s.win === "ai" ? 1e6 : -1e6;
    const aiPos = s.pRole === "dark";
    let sc = (aiPos ? s.c : -s.c) * 40;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cl = s.bd[r][c]; if (!cl) continue;
      if (cl.ow === "ai") {
        if (cl.cd.type === "being" && !cl.fd) {
          sc += 55 + (4 - (Math.abs(r - 2) + Math.abs(c - 2))) * 7 + r * 5;
          sc += STAT_DEFS.reduce((sum, st) => sum + Math.abs(cl.ib?.[st.key] || 0), 0) * 4;
          let minD = 99;
          for (let r2 = 0; r2 < 5; r2++) for (let c2 = 0; c2 < 5; c2++) { const nb = s.bd[r2][c2]; if (nb && nb.ow === "ai" && nb.cd.type === "being" && !nb.fd && (r2 !== r || c2 !== c)) { const d = Math.abs(r - r2) + Math.abs(c - c2); if (d < minD) minD = d; } }
          if (minD === 1) sc -= 10; else if (minD === 2) sc += 4;
          const aS = getEff(cl.cd, s.bd, r, c, cl.ib);
          const clIsZeroScore = aura(aS) === 0;
          for (const [tr, tc] of (clIsZeroScore ? adjFull(r, c) : adj(r, c, 1))) {
            const tg = s.bd[tr]?.[tc]; if (!tg || tg.ow !== "player" || tg.cd.type !== "being" || tg.fd) continue;
            const dS = getEff(tg.cd, s.bd, tr, tc, tg.ib);
            const canWin = STAT_DEFS.some(st => resolveCombat(aS, dS, st.key).winner === "attacker");
            sc += canWin ? 18 : -10;
          }
          // Zero-aura entities: strongly reward proximity to opponent terrain (diffuse target)
          if (clIsZeroScore) {
            for (let r2 = 0; r2 < 5; r2++) for (let c2 = 0; c2 < 5; c2++) {
              const t2 = s.bd[r2][c2]; if (!t2 || t2.ow !== "player" || t2.cd?.type !== "field") continue;
              const dist = Math.abs(r - r2) + Math.abs(c - c2);
              sc += dist === 0 ? 60 : dist === 1 ? 35 : dist === 2 ? 15 : 0;
            }
          }
          // c=0 vulnerability: opponent gets free spells — heavy penalty for being adjacent to a stronger foe
          if (s.c === 0) {
            for (const [nr, nc] of adj(r, c, 1)) {
              const opp = s.bd[nr]?.[nc]; if (!opp || opp.ow !== "player" || opp.cd.type !== "being" || opp.fd) continue;
              const opS = getEff(opp.cd, s.bd, nr, nc, opp.ib);
              if (STAT_DEFS.some(st => Math.abs(aS[st.key]) < Math.abs(opS[st.key]))) { sc -= 60; break; }
            }
          }
        }
        if (cl.fd) sc += r >= 2 ? 12 : 5;
        if (cl.cd.type === "field") sc += r >= 3 ? 16 : 7;
      } else {
        if (cl.cd.type === "being" && !cl.fd) {
          sc -= 28;
          const dS = getEff(cl.cd, s.bd, r, c, cl.ib);
          for (const [tr, tc] of (aura(getEff(cl.cd, s.bd, r, c, cl.ib)) === 0 ? adjFull(r, c) : adj(r, c, 1))) { const al = s.bd[tr]?.[tc]; if (al && al.ow === "ai" && al.cd.type === "being" && !al.fd) sc -= 10; }
        }
      }
    }
    sc += (s.aH.length - s.pH.length) * 2 + s.aD.length * 0.5;
    // Penalty for beings stuck in hand — encourages deploying them
    const handBeings = s.aH.filter(c => c.type === "being").length;
    if (handBeings > 0) sc -= handBeings * 12;
    return sc;
  }
  function aiPlan(init) {
    let bestScore = aiScore(init), bestSeq = [];
    function search(s, seq) {
      const sc = aiScore(s); if (sc > bestScore) { bestScore = sc; bestSeq = [...seq]; }
      if (seq.length >= 3 || s.act <= 0 || s.ph !== "playing") return;
      const acts = aiActions(s);
      // Detect if player can win with spells from their current hand this turn
      const pIsLight = s.pRole === "light";
      const cToWin = pIsLight ? C_MAX - s.c : s.c + C_MAX;
      const pWinSpells = s.pH.filter(c => pIsLight ? c.type === "bless" : c.type === "curse").map(c => cPwr(c)).sort((a, b) => b - a).slice(0, 3);
      const pCanWin = cToWin > 0 && pWinSpells.reduce((a, b) => a + b, 0) >= cToWin;
      acts.forEach(a => { if (a.type === "PLAY_SPELL") a.isUrgent = pCanWin; });
      acts.sort((a, b) => { const rank = x => x.isLethal ? 1000 : x.isUrgent ? 900 : x.type === "ATTACK" && x.val > 0 ? 100 + x.val : x.type === "TRIBUTE_SUMMON" ? 60 : x.type === "SUMMON" ? 55 : x.type === "EQUIP" ? 45 : x.type === "MOVE" ? 40 : x.type === "TERRAIN" ? 35 : x.type === "PLAY_SPELL" ? 20 : x.type === "SET_TRAP" ? (x.bluff ? 38 + Math.random() * 20 : 10) : x.type === "SET_EQUIP" ? (x.bluff ? 36 + Math.random() * 20 : 5) : 2; return rank(b) - rank(a); });
      const seen = {}; let tot = 0;
      const lim = { ATTACK: 5, PLAY_SPELL: 2, MOVE: 6, SUMMON: 5, TRIBUTE_SUMMON: 3, EQUIP: 4, TERRAIN: 3, SET_TRAP: 3, SET_EQUIP: 2, DRAW: 1 };
      for (const a of acts) {
        if (a.isLethal) { const s2 = aiClone(s); aiApply(s2, a); search(s2, [...seq, a]); continue; }
        seen[a.type] = (seen[a.type] || 0) + 1; if (seen[a.type] > (lim[a.type] || 3) || tot++ > 18) continue;
        const s2 = aiClone(s); aiApply(s2, a);
        if (seq.length > 0 && aiScore(s2) < bestScore - 150) continue;
        search(s2, [...seq, a]);
      }
    }
    search(aiClone(init), []);
    return bestSeq;
  }
  // ─── AI Execution ─────────────────────────────────────────────────────────────
  function runAI(g, idx) {
    if (forfeitRef.current) { setAiR(false); return; }
    if (g.ph === "over") { setAiR(false); return; }
    function endAITurn(s) {
      s.turn = "player"; s.act = actionsPerTurn; s.flips = 0; flipSets(s, "player"); s.tn++;
      if (!s.pD.length) reshufflePit(s, "player");
      if (s.pD.length) { s.pH = [...s.pH]; s.pD = [...s.pD]; s.pH.push(s.pD.shift()); playSfx("draw"); }
      setGame({ ...s }); setAiR(false);
    }
    if (idx === 0) { aiPlanRef.current = aiPlan(g); }
    const planned = aiPlanRef.current[idx];
    if (!planned || g.act <= 0 || idx >= 10) {
      endAITurn({ ...g, bd: g.bd.map(r => [...r]), aH: [...g.aH], aD: [...g.aD], pH: [...g.pH], pD: [...g.pD] }); return;
    }
    let s = { ...g, bd: g.bd.map(r => [...r]), aH: [...g.aH], aD: [...g.aD], pH: [...g.pH], pD: [...g.pD] };
    // Delay helper — waits for animation to finish + breathing room
    // Animation durations from drF: video=dur+900 or 7s, battle=2600, image=2200, icon-only=1100
    const delay = (ms) => setTimeout(() => runAI(s, idx + 1), ms);
    const hasVid = (card) => videoFor(card);
    // Spell/summon with video: let the video animation drive timing (handled by onVideoEnd in drF)
    // Spell/summon with image: 2200ms anim + 400ms breath = 2600
    // Icon-only flash: 1100ms anim + 400ms breath = 1500
    // No animation (pure state change): 800ms so player can register the board change
    switch (planned.type) {
      case "PLAY_SPELL": {
        const hi = s.aH.findIndex(c => c.id === planned.card.id);
        if (hi === -1) { endAITurn(s); return; }
        const sp = s.aH[hi];
        const v = sp.type === "bless" ? cPwr(sp) : -cPwr(sp);
        s.aH.splice(hi, 1); s.act--;
        if (sp.type === "bless") enqF(`+${cPwr(sp)}C`, { color: T.bless, border: T.bless, icon: "△", image: sp.image, video: videoFor(sp) });
        else enqF(`−${cPwr(sp)}C`, { color: T.curse, border: T.curse, icon: "▽", image: sp.image, video: videoFor(sp) });
        playSfx("action"); applyC(s, v);
        if (cPwr(sp) === 1) { if (!s.aD.length) reshufflePit(s, "ai"); if (s.aD.length) { const d = s.aD.shift(); s.aH.push(d); addLog(`Opp Draw (free)`); } }
        toPit(sp, "ai"); addLog(`Opp ${sp.type}: ${sp.name || sp.type}`);
        setGame({ ...s }); delay(hasVid(sp) ? 3500 : sp.image ? 2600 : 1500); break;
      }
      case "ATTACK": {
        const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, stat } = planned;
        const atk = s.bd[fr]?.[fc]; const def = s.bd[tr]?.[tc];
        if (!atk || !def) { endAITurn(s); return; }
        const aS = getEff(atk.cd, s.bd, fr, fc, atk.ib), dS = getEff(def.cd, s.bd, tr, tc, def.ib);
        const res = resolveCombat(aS, dS, stat);
        const aiBO = { atkCard: atk.cd, defCard: def.cd, sub: `Opp ${stat.toUpperCase()} |${Math.abs(aS[stat])}| vs |${Math.abs(dS[stat])}|` };
        if (res.winner === "attacker") { s.bd[tr][tc] = null; toPit(def.cd, "player"); }
        else if (res.winner === "defender") { s.bd[fr][fc] = null; toPit(atk.cd, "ai"); }
        s.act--;
        combatC(s, res.dmg, res.winningStat, "ai", aiBO, atk.cd, def.cd, true, `⚔ ${atk.cd.name || "Atk"} > ${def.cd.name || "Def"}`, stat);
        setGame({ ...s }); delay(3000); break;
      }
      case "MOVE": {
        const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc } = planned;
        const cl = s.bd[fr]?.[fc]; if (!cl) { endAITurn(s); return; }
        const clEffS = getEff(cl.cd, s.bd, fr, fc, cl.ib);
        const clIsFieldTrans = aura(clEffS) === 0 && aura(cl.cd) !== 0;
        s.bd[fr][fc] = null;
        const aiConsumed = chkTraps(s, tr, tc, "ai", cl, clIsFieldTrans);
        if (!aiConsumed) s.bd[tr][tc] = cl;
        checkFieldFreeings(s);
        s.act--;
        addLog(`Opp Move: ${cl.cd.name || "Being"}`); setGame({ ...s }); delay(900); break;
      }
      case "SUMMON": {
        const hi = s.aH.findIndex(c => c.id === planned.card.id);
        if (hi === -1) { endAITurn(s); return; }
        const card = s.aH[hi]; const { row: r, col: c } = planned;
        const existing = s.bd[r][c];
        const isPurge = existing && (existing.cd?.type === "field" || (existing.fd && existing.cd?.type !== "equip"));
        if (existing && !isPurge) { endAITurn(s); return; }
        if (isPurge) s.bd[r][c] = null; // clear before animation
        s.aH.splice(hi, 1); s.act--;
        playSfx("action");
        const summonVid = !isPurge && hasVid(card);
        if (isPurge) {
          enqF("PURGE", { color: TC.field, border: TC.field, icon: "✕", image: card.image });
          addLog(`Opp Purge: ${existing.cd?.name || existing.cd?.type}`);
        } else {
          enqF("SUMMON", { color: T.being, border: TC[card.type] || T.being, image: card.image, video: videoFor(card) });
          addLog(`Opp Summon: ${card.name || "Being"}`);
        }
        setGame({ ...s });
        const placeDly = summonVid ? 2000 : 1100;
        setTimeout(() => {
          s.bd[r][c] = { cd: card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true };
          setGame({ ...s }); setTimeout(() => runAI(s, idx + 1), summonVid ? 1500 : 800);
        }, placeDly); break;
      }
      case "TRIBUTE_SUMMON": {
        const hi = s.aH.findIndex(c => c.id === planned.card.id);
        if (hi === -1) { endAITurn(s); return; }
        const card = s.aH[hi]; const { row: r, col: c, tribRow: tr, tribCol: tc } = planned;
        const tribCell = s.bd[tr]?.[tc];
        if (!tribCell || tribCell.ow !== "ai") { endAITurn(s); return; }
        s.aH.splice(hi, 1);
        toPit(tribCell.cd, "ai");
        s.bd[tr][tc] = null; s.act--;
        const tribVid = hasVid(card);
        enqF("TRIBUTE", { color: T.legendary, border: T.legendary, icon: "✦", image: card.image, video: videoFor(card) });
        addLog(`Opp Tribute: ${tribCell.cd?.name || "Being"} → ${card.name || "Being"}`);
        setGame({ ...s });
        const placeDly = tribVid ? 2000 : 1100;
        setTimeout(() => {
          s.bd[r][c] = { cd: card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true };
          setGame({ ...s }); setTimeout(() => runAI(s, idx + 1), tribVid ? 1500 : 800);
        }, placeDly); break;
      }
      case "TERRAIN": {
        const hi = s.aH.findIndex(c => c.id === planned.card.id);
        if (hi === -1) { endAITurn(s); return; }
        const card = s.aH[hi]; const { row: r, col: c } = planned;
        s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } };
        addLog(`Opp Field: ${card.name || "Field"}`); setGame({ ...s }); delay(800); break;
      }
      case "EQUIP": {
        const hi = s.aH.findIndex(c => c.id === planned.item.id);
        if (hi === -1) { endAITurn(s); return; }
        const item = s.aH.splice(hi, 1)[0]; const cl = s.bd[planned.row]?.[planned.col];
        if (!cl) { endAITurn(s); return; }
        cl.ib = { ...cl.ib }; STAT_DEFS.forEach(st => { cl.ib[st.key] = (cl.ib[st.key] || 0) + (item[st.key] || 0); });
        s.act--; addLog(`Opp Equip: ${item.name || "Equip"}`); setGame({ ...s }); delay(800); break;
      }
      case "SET_TRAP": {
        const hi = s.aH.findIndex(c => c.id === planned.card.id);
        if (hi === -1) { endAITurn(s); return; }
        const card = s.aH[hi]; const { row: r, col: c } = planned;
        if (s.bd[r][c]) { endAITurn(s); return; }
        s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: true, prm: 1 };
        playSfx("draw"); enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "▼" });
        s.act--; addLog(`Opp Set: Trap`); setGame({ ...s }); delay(1500); break;
      }
      case "SET_EQUIP": {
        const hi = s.aH.findIndex(c => c.id === planned.card.id);
        if (hi === -1) { endAITurn(s); return; }
        const card = s.aH[hi]; const { row: r, col: c } = planned;
        if (s.bd[r][c]) { endAITurn(s); return; }
        s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: true, prm: 1 };
        playSfx("draw"); enqF("SET", { color: TC.equip, border: TC.equip, icon: "▼" });
        s.act = 0; addLog(`Opp Set: Equip`); setGame({ ...s }); delay(1500); break;
      }
      case "DRAW": {
        if (s.aD.length) { s.aH.push(s.aD.shift()); s.act--; }
        playSfx("draw");
        addLog(`Opp Draw`); setGame({ ...s }); delay(600); break;
      }
      default:
        endAITurn(s);
    }
  }

  // Refresh image list from server
  async function refreshImages() {
    try { const r = await fetch(`${API}/images/list`); if (r.ok) setAllImages(await r.json()); } catch {}
  }

  // Forge / import
  async function handleImg(e) {
    const f = e.target.files[0]; if (!f) return;
    const path = await uploadFile(f);
    if (path) { setNc(p => ({ ...p, image: path })); refreshImages(); }
  }
  async function handleBulk(e) {
    const files = Array.from(e.target.files);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = await uploadFile(f);
      if (path) {
        setCardPool(p => [...p, {
          id: "imp_" + Date.now() + "_" + i, name: "", type: "being",
          soul: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          mind: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          will: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          rarity: ["common", "common", "uncommon", "rare"][Math.floor(Math.random() * 4)],
          gradient: DG.being, image: path, set: nc.set || "Imported"
        }]);
      }
    }
  }
  function createCard() {
    const id = "c_" + Date.now(); const card = { ...nc, id };
    if (!["being", "field", "equip"].includes(nc.type)) STAT_DEFS.forEach(s => { card[s.key] = 0; });
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
    const cost = setObj.cost_per_pack ?? PACK_COST;
    if (tokens < cost) return;
    playSfx("pack");
    const sc = cardPool.filter(c => setObj.cardIds.includes(c.id) && c.image); if (!sc.length) return;
    setTokens(t => t - cost);
    const pack = [];
    for (let i = 0; i < CARDS_PER_PACK; i++) {
      let totalW = 0; for (const c of sc) totalW += c.weight || 100;
      let roll = Math.random() * totalW; let pick = sc[0];
      for (const c of sc) { roll -= (c.weight || 100); if (roll <= 0) { pick = c; break; } }
      pack.push(pick);
    }
    setColl(prev => { const n = { ...prev }; pack.forEach(c => { n[c.id] = (n[c.id] || 0) + 1; }); return n; });
    setPackRes(pack); setPackFlip(pack.map(() => false)); setPackSp(pack.map(c => c.rarity === "legendary"));
    setTokenFlash(true); setTimeout(() => setTokenFlash(false), 700);
  }

  // ═══ CARD GENERATION HELPER (pure — no state reads) ═══
  function mkRNG(seed) {
    let s = (seed || 42) & 0x7fffffff || 1;
    return () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 2147483647; };
  }

  function genCardsForParams({ name, total, powerMin, powerMax,
    pctEntity, pctBless, pctCurse, pctTerrain, pctItem,
    blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
    equipPwrMin = 1, equipPwrMax = 3, terrPwrMin = 1, terrPwrMax = 3,
    rarCommon, rarUncommon, rarRare, rarLegendary,
    ensureTypes, images = {}, mode = "random", ts: tsIn, counters = {}, rng: rngIn = null }) {
    const rng = rngIn || Math.random;
    const ts = tsIn !== undefined ? tsIn : Date.now();
    const newCards = [];

    function allPerms(pMin, pMax) {
      const p = [];
      for (let s = -STAT_MAX; s <= STAT_MAX; s++) for (let m = -STAT_MAX; m <= STAT_MAX; m++) for (let w = -STAT_MAX; w <= STAT_MAX; w++) { if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= pMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= pMax) p.push({ soul: s, mind: m, will: w }); }
      return p;
    }
    function randStats(pMin, pMax) {
      for (let a = 0; a < 100; a++) {
        const s = Math.floor(rng() * (STAT_MAX * 2 + 1)) - STAT_MAX, m = Math.floor(rng() * (STAT_MAX * 2 + 1)) - STAT_MAX, w = Math.floor(rng() * (STAT_MAX * 2 + 1)) - STAT_MAX;
        if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= pMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= pMax) return { soul: s, mind: m, will: w };
      } return { soul: 1, mind: 1, will: 0 };
    }

    function gradFor(type, o) {
      const h = type === "bless" ? 210 : type === "curse" ? 350 : type === "field" ? 80 : type === "equip" ? 30 : o > 0 ? 40 : o < 0 ? 280 : 170;
      const sat = type === "being" ? 20 : 15, b = 18 + Math.floor(rng() * 22);
      return [`hsl(${h},${sat + Math.floor(rng() * 10)}%,${b}%)`, `hsl(${h},${sat}%,${Math.floor(b / 2)}%)`];
    }
    function rPwr(min, max) { return min + Math.floor(rng() * (max - min + 1)); }
    function nextCardId(type) {
      if (!counters[type]) counters[type] = 1;
      return `${TYPE_PREFIX[type] || "GEN"}-${String(counters[type]++).padStart(5, "0")}`;
    }

    const counts = {
      being: Math.round(total * pctEntity / 100), bless: Math.round(total * pctBless / 100),
      curse: Math.round(total * pctCurse / 100), field: Math.round(total * pctTerrain / 100), equip: Math.round(total * pctItem / 100)
    };
    counts.being += total - Object.values(counts).reduce((a, b) => a + b, 0);
    const perms = mode === "permute" ? shuffle([...allPerms(powerMin, powerMax)]) : null;
    let pIdx = 0;

    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        let stats, pwr;
        if (type === "being") { stats = perms ? perms[pIdx++ % perms.length] : randStats(powerMin, powerMax); }
        else if (type === "bless") { stats = { soul: 0, mind: 0, will: 0 }; pwr = rPwr(blessPwrMin, blessPwrMax); }
        else if (type === "curse") { stats = { soul: 0, mind: 0, will: 0 }; pwr = rPwr(cursePwrMin, cursePwrMax); }
        else if (type === "field") { stats = randStats(terrPwrMin, terrPwrMax); }
        else { stats = randStats(equipPwrMin, equipPwrMax); }
        const card = {
          id: nextCardId(type), name: "", type, ...stats,
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
    ["legendary", "rare", "uncommon"].forEach(rar => {
      const rarW = rar === "legendary" ? rarLegendary : rar === "rare" ? rarRare : rarUncommon;
      const targetCount = Math.round(total * rarW / totalW);
      let rarAssigned = 0;
      if (ensureTypes) {
        for (const t of ["being", "bless", "curse", "field", "equip"]) {
          if (rarAssigned >= targetCount) break;
          const card = newCards.find(c => !assignedIds.has(c.id) && c.type === t);
          if (card) { card.rarity = rar; assignedIds.add(card.id); rarAssigned++; }
        }
      }
      if (rar === "legendary") {
        const pols = ["light", "dark", "balanced"]; let polIdx = 0;
        for (const card of newCards) {
          if (rarAssigned >= targetCount || assignedIds.has(card.id) || card.type !== "being") continue;
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

    // Assign images/gradients
    newCards.forEach((card, ci) => {
      if (images[ci]) { card.image = images[ci]; }
      else { card.gradient = card.type === "being" ? gradFor(card.type, card.soul + card.mind + card.will) : DG[card.type] || DG.being; }
    });
    return newCards;
  }

  // ═══ SET GENERATOR ═══
  function generateSet() {
    const ts = Date.now();
    const counters = computeStartCounters(cardPool);
    const newCards = genCardsForParams({ ...gen, images: genImages, mode: genMode, ts, counters, rng: mkRNG(genSeed) });
    setCardPool(prev => [...prev, ...newCards]);
    setSets(prev => [...prev, { id: "gen_" + ts, name: gen.name, color: gen.color, cardIds: newCards.map(c => c.id) }]);
    setGen(p => ({ ...p, color: randSetColor() }));
    enqF("SET GENERATED", { color: T.silverBright, border: T.silver, icon: "◈", sub: `${newCards.length} cards: ${gen.name}` });
    return newCards.length;
  }

  // ═══ CAMPAIGN GENERATOR ═══
  function generateCampaign() {
    const lerp = (a, b, t) => a + (b - a) * t;
    const n = CAMPAIGN_SET_IDS.length;
    const ts = Date.now();
    const camRng = mkRNG(camSeed);
    const allNewCards = [];
    const setCardMap = {};
    const counters = computeStartCounters(cardPool); // shared across all sets, increments continuously
    // Compute per-set card counts (mirrors campaignPreview logic)
    const total = camGen.cardsPerSet * n;
    let setCounts;
    if (camGen.distMode === "bell") {
      const center = (n - 1) / 2;
      const sigma = Math.max(0.5, (n / 2) * (camGen.bellSpread / 100));
      const weights = Array.from({ length: n }, (_, i) => Math.exp(-0.5 * ((i - center) / sigma) ** 2));
      const sumW = weights.reduce((a, b) => a + b, 0);
      setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
      const diff = total - setCounts.reduce((a, b) => a + b, 0);
      setCounts[Math.floor(n / 2)] = Math.max(1, setCounts[Math.floor(n / 2)] + diff);
    } else if (camGen.distMode === "ramp") {
      const weights = Array.from({ length: n }, (_, i) => i + 1);
      const sumW = weights.reduce((a, b) => a + b, 0);
      setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
      const diff = total - setCounts.reduce((a, b) => a + b, 0);
      setCounts[n - 1] = Math.max(1, setCounts[n - 1] + diff);
    } else if (camGen.distMode === "ramp_inv") {
      const weights = Array.from({ length: n }, (_, i) => n - i);
      const sumW = weights.reduce((a, b) => a + b, 0);
      setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
      const diff = total - setCounts.reduce((a, b) => a + b, 0);
      setCounts[0] = Math.max(1, setCounts[0] + diff);
    } else {
      setCounts = Array(n).fill(camGen.cardsPerSet);
    }

    const setName = id => id === "core" ? "A" : id.replace("set_", "").toUpperCase();
    CAMPAIGN_SET_IDS.forEach((setId, si) => {
      const t = si / (n - 1);
      const setObj = sets.find(s => s.id === setId) || { id: setId, name: setName(setId), color: "#303030", cardIds: [] };
      const powerMin = Math.round(lerp(camGen.startPowerMin, camGen.endPowerMin, t));
      const powerMax = Math.max(powerMin, Math.round(lerp(camGen.startPowerMax, camGen.endPowerMax, t)));
      const blessPwrMin = Math.round(lerp(camGen.startBlessPwrMin, camGen.endBlessPwrMin, t));
      const blessPwrMax = Math.max(blessPwrMin, Math.round(lerp(camGen.startBlessPwrMax, camGen.endBlessPwrMax, t)));
      const cursePwrMin = Math.round(lerp(camGen.startCursePwrMin, camGen.endCursePwrMin, t));
      const cursePwrMax = Math.max(cursePwrMin, Math.round(lerp(camGen.startCursePwrMax, camGen.endCursePwrMax, t)));
      const equipPwrMin = Math.round(lerp(camGen.startEquipPwrMin, camGen.endEquipPwrMin, t));
      const equipPwrMax = Math.max(equipPwrMin, Math.round(lerp(camGen.startEquipPwrMax, camGen.endEquipPwrMax, t)));
      const terrPwrMin = Math.round(lerp(camGen.startTerrPwrMin, camGen.endTerrPwrMin, t));
      const terrPwrMax = Math.max(terrPwrMin, Math.round(lerp(camGen.startTerrPwrMax, camGen.endTerrPwrMax, t)));
      const rarCommon = Math.round(lerp(camGen.startRarCommon, camGen.endRarCommon, t));
      const rarUncommon = Math.round(lerp(camGen.startRarUncommon, camGen.endRarUncommon, t));
      const rarRare = Math.round(lerp(camGen.startRarRare, camGen.endRarRare, t));
      const rarLegendary = Math.round(lerp(camGen.startRarLegendary, camGen.endRarLegendary, t));
      const newCards = genCardsForParams({
        name: setObj.name, total: setCounts[si],
        powerMin, powerMax,
        pctEntity: camGen.pctEntity, pctBless: camGen.pctBless,
        pctCurse: camGen.pctCurse, pctTerrain: camGen.pctTerrain, pctItem: camGen.pctItem,
        blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
        equipPwrMin, equipPwrMax, terrPwrMin, terrPwrMax,
        rarCommon, rarUncommon, rarRare, rarLegendary,
        ensureTypes: camGen.ensureTypes, images: {}, mode: "random", ts: ts + si * 1000, counters, rng: camRng,
      });
      allNewCards.push(...newCards);
      setCardMap[setId] = newCards.map(c => c.id);
    });

    const oldIds = new Set(CAMPAIGN_SET_IDS.flatMap(sid => sets.find(s => s.id === sid)?.cardIds || []));
    setCardPool(prev => [...prev.filter(c => !oldIds.has(c.id)), ...allNewCards]);
    setSets(prev => {
      const existingIds = new Set(prev.map(s => s.id));
      const updated = prev.map(s => CAMPAIGN_SET_IDS.includes(s.id) ? { ...s, cardIds: setCardMap[s.id] || [] } : s);
      CAMPAIGN_SET_IDS.forEach(sid => {
        if (!existingIds.has(sid)) updated.push({ id: sid, name: setName(sid), color: "#303030", cardIds: setCardMap[sid] || [] });
      });
      return updated;
    });
    enqF("CAMPAIGN GENERATED", { color: T.legendary, border: T.legendary + "80", icon: "✦", sub: `${allNewCards.length} cards · ${CAMPAIGN_SET_IDS.length} sets` });
  }

  const owned = id => coll[id] || 0;
  const isH = (r, c) => hl.some(([hr, hc]) => hr === r && hc === c);
  const B = (col, dis) => ({ padding: "8px 16px", background: dis ? T.panelBorder : col + "12", border: `1px solid ${dis ? T.panelBorder : col}`, borderRadius: 2, color: dis ? T.textDim : col, cursor: dis ? "not-allowed" : "pointer", fontFamily: FONT_UI, fontSize: 11, letterSpacing: 1, fontWeight: 700 });
  const LBL = { fontFamily: FONT_UI, fontSize: 7, color: T.textDim, letterSpacing: 2, display: "block", marginBottom: 1, textTransform: "uppercase", fontWeight: 700 };
  const INP = { width: "100%", padding: "4px 7px", background: T.bg2, border: `1px solid ${T.panelBorder}`, borderRadius: 2, color: T.text, fontFamily: FONT_BODY, fontSize: 12, outline: "none" };

  const tabs = [["play", "Play"], ["duel", "Duel"], ["browse", "Codex"], ["decks", "Decks"], ["packs", "Packs"], ["create", "Forge"], ["editor", "Editor"]];

  function generateStructureDecks() {
    const { count, deckSize, factionMode, artOnly } = autoGenCfg;
    const byType = t => cardPool.filter(c => c.type === t && (!artOnly || c.image));
    const allEnts   = byType("being");
    const blessings = byType("bless");
    const curses    = byType("curse");
    const equips    = byType("equip");
    const terrains  = byType("field");
    const transEnts  = allEnts.filter(isTranscendent);
    const normalEnts = allEnts.filter(c => !isTranscendent(c));

    // Bucket entities by dominant absolute stat for coverage
    const getBucket = c => {
      const s = Math.abs(c.soul || 0), m = Math.abs(c.mind || 0), w = Math.abs(c.will || 0);
      const max = Math.max(s, m, w);
      if (max === 0) return "other";
      if (s === max && s > m && s > w) return "soul";
      if (m === max && m > s && m > w) return "mind";
      if (w === max && w > s && w > m) return "will";
      return "other";
    };
    const buckets = { soul: [], mind: [], will: [], other: [] };
    for (const c of normalEnts) buckets[getBucket(c)].push(c);

    // Bell-curve power pick (median-centered) with MAX_COPIES, tracking external copies
    function pick(pool, n, extCopies = {}) {
      if (!pool.length || n <= 0) return [];
      const powers = pool.map(c => cPwr(c)).sort((a, b) => a - b);
      const mid = powers[Math.floor(powers.length / 2)] || 2;
      const scored = pool
        .filter(c => (extCopies[c.id] || 0) < MAX_COPIES)
        .map(c => ({ c, s: Math.exp(-((cPwr(c) - mid) ** 2) / (mid * 2 || 1)) + Math.random() * 0.45 }));
      scored.sort((a, b) => b.s - a.s);
      const result = [];
      for (let pass = 1; pass <= MAX_COPIES; pass++) {
        for (const { c } of scored) {
          if (result.length >= n) break;
          const total = (extCopies[c.id] || 0) + result.filter(id => id === c.id).length;
          if (total === pass - 1) result.push(c.id);
        }
        if (result.length >= n) break;
      }
      return result.slice(0, n);
    }

    // Guaranteed anchors: best entity by each absolute stat across the entire pool
    const maxBy = (stat) => allEnts.reduce((best, c) => Math.abs(c[stat] || 0) > Math.abs(best?.[stat] || 0) ? c : best, null);
    const anchorCards = [...new Set([maxBy("soul"), maxBy("mind"), maxBy("will")].filter(Boolean))];

    // Pick entities ensuring ~equal coverage across soul/mind/will + 2-4 transcendents + 3 stat anchors
    function pickEntities(n) {
      // Seed with anchors (guaranteed top-ceiling entity per stat)
      const anchorIds = anchorCards.map(c => c.id);
      // Add transcendents
      const transCount = Math.min(transEnts.length, Math.floor(Math.random() * 3) + 2); // 2-4
      const transIds = [...transEnts].sort(() => Math.random() - 0.5).slice(0, transCount).map(c => c.id);
      // Combine, deduplicate
      const seeded = [...new Set([...anchorIds, ...transIds])];
      const copies = Object.fromEntries(seeded.map(id => [id, 1]));
      const result = [...seeded];
      let rem = n - result.length;
      if (rem <= 0) return result.slice(0, n);
      // Fill remaining 1/3 from each dominant-stat bucket for coverage
      const perBucket = Math.floor(rem / 3);
      const extra = rem % 3;
      ["soul", "mind", "will"].forEach((key, i) => {
        const ids = pick(buckets[key], perBucket + (i < extra ? 1 : 0), copies);
        ids.forEach(id => { copies[id] = (copies[id] || 0) + 1; });
        result.push(...ids);
      });
      // Fill any gaps from the "other" bucket or all normal ents
      if (result.length < n) {
        const fallback = [...buckets.other, ...normalEnts];
        result.push(...pick(fallback, n - result.length, copies));
      }
      return result.slice(0, n);
    }

    // Pick equips synergistic with the entity stat distribution
    function pickEquips(n, entityIds) {
      if (!equips.length || n <= 0) return [];
      const entCards = entityIds.map(id => allEnts.find(c => c.id === id)).filter(Boolean);
      const statW = { soul: 0, mind: 0, will: 0 };
      for (const c of entCards) {
        const s = Math.abs(c.soul || 0), m = Math.abs(c.mind || 0), w = Math.abs(c.will || 0), t = s + m + w || 1;
        statW.soul += s / t; statW.mind += m / t; statW.will += w / t;
      }
      const scored = equips.map(c => ({
        c, s: statW.soul * Math.abs(c.soul || 0) + statW.mind * Math.abs(c.mind || 0)
              + statW.will * Math.abs(c.will || 0) + Math.random() * 1.5
      }));
      scored.sort((a, b) => b.s - a.s);
      const result = []; const copies = {};
      for (let pass = 1; pass <= MAX_COPIES; pass++) {
        for (const { c } of scored) {
          if (result.length >= n) break;
          const total = (copies[c.id] || 0) + result.filter(id => id === c.id).length;
          if (total === pass - 1) { result.push(c.id); copies[c.id] = (copies[c.id] || 0) + 1; }
        }
        if (result.length >= n) break;
      }
      return result.slice(0, n);
    }

    // Strategy variations: [entPct, bcPct, equPct, oneCRatio (% of BC that are 1C free-draw)]
    const STRATEGIES = [
      [0.60, 0.20, 0.15, 0.35], // Balanced
      [0.65, 0.14, 0.16, 0.20], // Aggro  — more entities, fewer spells, fewer draws
      [0.50, 0.30, 0.15, 0.50], // Control — more spells, half are 1C for card advantage
      [0.55, 0.20, 0.20, 0.25], // Tempo  — equip-heavy for entity buffs
    ];

    const toRoman = n => { const v=[1000,900,500,400,100,90,50,40,10,9,5,4,1],s=["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"]; let r=""; v.forEach((val,i)=>{ while(n>=val){r+=s[i];n-=val;} }); return r; };

    const newDecks = [];
    for (let i = 0; i < count; i++) {
      // Single deck: honour faction choice; multi-deck: always alternate light/dark
      const faction = count === 1
        ? (factionMode === "curse" ? "curse" : factionMode === "rand" ? (Math.random() < 0.5 ? "bless" : "curse") : "bless")
        : (i % 2 === 0 ? "bless" : "curse");
      const [entPct, bcPct, equPct, oneCRatio] = STRATEGIES[i % STRATEGIES.length];
      const vary = () => Math.floor(Math.random() * 5) - 2; // ±2 organic variation
      const bcSlots   = Math.max(5, Math.round(deckSize * bcPct) + vary());
      const equSlots  = Math.max(3, Math.round(deckSize * equPct) + vary());
      const terrSlots = 2;
      const entSlots  = Math.max(4, deckSize - bcSlots - equSlots - terrSlots);

      const bcPool = faction === "bless" ? blessings : curses;
      // Mix 1C (free draw) and high-C spells deliberately
      const oneC   = bcPool.filter(c => cPwr(c) === 1);
      const highC  = bcPool.filter(c => cPwr(c) > 1);
      const oneCSlots  = Math.min(oneC.length * MAX_COPIES, Math.round(bcSlots * oneCRatio));
      const highCSlots = bcSlots - oneCSlots;

      const entityIds = pickEntities(entSlots);
      const cards = [
        ...entityIds,
        ...pick(oneC, oneCSlots),
        ...pick(highC, highCSlots),
        ...pickEquips(equSlots, entityIds),
        ...pick(terrains, terrSlots),
      ];
      const name = toRoman(decks.length + i + 1);
      newDecks.push({ name, cards });
    }
    setDecks(p => [...p, ...newDecks]);
  }

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: T.bg, color: T.text, fontFamily: FONT_BODY, display: "flex", flexDirection: "column" }}>
      <Flash flash={flash} boardRef={boardRef} slamAnim={slamAnim} cinemaMode={cinemaMode} cinemaRef={cinemaRef} cinemaSwap={cinemaSwap} />
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
      <header style={{ background: T.bg2, borderBottom: `1px solid ${T.panelBorder}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 15, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_TITLE, fontSize: 32, color: T.white, lineHeight: 1 }}>Trinity</span>
        <div style={{ width: 1, height: 24, background: T.panelBorder }} />
        <nav style={{ display: "flex", gap: 3 }}>
          {tabs.map(([id, l]) => (
            <button key={id} onClick={() => { setTab(id); if (id !== "duel" && !game) setMMode(false); }} style={{
              padding: "4px 12px", background: tab === id ? T.white + "08" : "transparent",
              border: `1px solid ${tab === id ? T.silverDim : "transparent"}`, borderRadius: 2, cursor: "pointer",
              color: tab === id ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 10, letterSpacing: 2.5,
              textTransform: "uppercase", fontWeight: tab === id ? 900 : 500
            }}>{l}</button>))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setMuted(!muted)} style={{
            background: "none", border: "none", cursor: "pointer", color: muted ? T.danger : T.silverBright,
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8
          }}>
            <span style={{ fontSize: 14 }}>{muted ? "🔇" : "🔊"}</span>
          </button>
          <button onClick={() => setShowSettings(true)} style={{
            background: "none", border: "none", cursor: "pointer", color: T.silverBright,
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8
          }}>
            <span style={{ fontSize: 14 }}>⚙</span>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: (tab === "play" || tab === "duel") && game ? "hidden" : "auto", padding: (tab === "play" || tab === "duel") ? "12px 20px" : "6px 10px", ...(cinemaMode && game ? { [cinemaSwap ? "marginRight" : "marginLeft"]: 370, maxWidth: "none", width: "calc(100% - 370px)" } : { maxWidth: 1100, margin: "0 auto", width: "100%" }), minHeight: 0 }}>

        {/* Play lobby (Original AI) */}
        {tab === "play" && !game && (
          <div style={{ textAlign: "center", padding: "24px 16px", animation: "fadeIn .5s", zoom: 1.5 }}>
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
                            playSfx("select");
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

        {/* Duel Lobby (Multiplayer) */}
        {tab === "duel" && !game && (
          <div style={{ textAlign: "center", padding: "24px 16px", animation: "fadeIn .5s", zoom: 1.5 }}>
            <div style={{ fontFamily: FONT_TITLE, fontSize: 48, color: T.white, lineHeight: 1 }}>Duel</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 8, color: T.silverDim, letterSpacing: 7, marginTop: 2, marginBottom: 18, fontWeight: 600 }}>TWO HEAVENS UNITED</div>

            <div style={{ maxWidth: 450, margin: "0 auto 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
              {[["Us (GOOD)", selDI, setSelDI, T.silverBright, "p1"], ["Them (EVIL)", oppDI, setOppDI, T.curse, "p2"]].map(([lb, sel, setSel, col, role], sideIdx) => {
                const isTaken = mTaken.includes(role);
                const isMyRole = mRole === role;
                const showLock = isTaken && !isMyRole;

                return (
                  <div key={lb} style={{ display: "flex", flexDirection: "column", gap: 4, opacity: showLock ? 0.35 : 1, pointerEvents: showLock ? "none" : "auto" }}>
                    <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 2, marginBottom: 3, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                      <span>{lb}</span>
                      {isTaken && <span style={{ color: isMyRole ? T.bless : T.danger }}>
                        {isMyRole ? `${mAlias || ""} You` : `${mOppAlias || ""}`}
                      </span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {decks.map((d, i) => {
                        const mag = getDeckMagnitude(d, cardPool);
                        // Filter by polarity if needed, but in Duel we allow more freedom or can stick to constraints
                        const pMag = getDeckMagnitude(decks[selDI], cardPool);
                        let disabled = sideIdx === 1 && ((pMag > 0 && mag > 0) || (pMag < 0 && mag < 0));

                        return (
                          <button key={i} onClick={() => {
                            if (!isMyRole) return;
                            playSfx("select");
                            setSel(i);
                            if (ws.current?.readyState === WebSocket.OPEN) {
                              ws.current.send(JSON.stringify({ type: "select_deck", role, deck: d, deck_idx: i }));
                            }
                          }} style={{
                            padding: "6px 10px", background: sel === i ? col + "14" : T.panel,
                            border: `1px solid ${sel === i ? col : T.panelBorder}`, borderRadius: 2,
                            cursor: isMyRole ? "pointer" : "default", color: sel === i ? col : T.textDim, fontFamily: FONT_UI,
                            fontSize: 8, fontWeight: 700, textAlign: "left",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            opacity: (disabled || !isMyRole) && sel !== i ? 0.35 : 1, transition: "all .2s"
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

            {mOppDeck && <div style={{ marginBottom: 16, fontSize: 9, color: T.silver, fontFamily: FONT_UI }}>Opponent selected: <span style={{ color: T.white }}>{mOppDeck}</span></div>}

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button onClick={startGame} disabled={mWait || !mRole || mRole === "spectator"} style={{
                padding: "6px 32px", background: "transparent", border: `1.5px solid ${T.silverBright}`, borderRadius: 2,
                cursor: mWait || !mRole || mRole === "spectator" ? "default" : "pointer", fontFamily: FONT_TITLE, fontSize: 16, color: T.white, letterSpacing: 4,
                opacity: mWait || !mRole || mRole === "spectator" ? 0.4 : 1
              }}>
                {mWait ? "WAITING..." : "Reckoning"}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: mRole ? T.bless : T.danger }} />
                <div style={{ fontSize: 8, color: T.silverBright, fontFamily: FONT_UI, letterSpacing: 2 }}>
                  {mRole ? `STATUS: CONNECTED ${mRole === "p1" ? "FIRST" : mRole === "p2" ? "LAST" : mRole.toUpperCase()}` : "STATUS: CONNECTING..."}
                </div>
                <button onClick={() => {
                  if (confirm("Hard reset will kick ALL players and clear the game. Continue?")) {
                    ws.current?.send(JSON.stringify({ type: "reset", hard: true }));
                  }
                }} style={{
                  background: "transparent", border: `1px solid ${T.danger}`, color: T.danger, fontSize: 6, padding: "2px 6px", borderRadius: 2, cursor: "pointer", opacity: 0.6, marginLeft: 8
                }}>HARD RESET ROOM</button>
              </div>

              {/* Identity picker — override auto-assigned icon */}
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                  {["📜", "🗝️", "🕯️", "🏺", "⏳", "🪔", "🪶"].map(e => (
                    <button key={e} onClick={() => {
                      const next = mAlias === e ? null : e;
                      setMAlias(next);
                      if (ws.current?.readyState === WebSocket.OPEN && mRole && mRole !== "spectator") {
                        ws.current.send(JSON.stringify({ type: "set_alias", role: mRole, alias: next || "" }));
                      }
                    }} style={{
                      fontSize: 18, background: "none", border: `1.5px solid ${mAlias === e ? T.silverBright : "transparent"}`,
                      borderRadius: 6, padding: "2px 4px", cursor: "pointer", opacity: mAlias === e ? 1 : 0.35,
                      transition: "all .15s", lineHeight: 1.3,
                    }}>{e}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Play/Duel game board */}
        {(tab === "play" || tab === "duel") && game && (
          <div style={{ display: "grid", gridTemplateColumns: cinemaMode ? (cinemaSwap ? "280px 1fr" : "1fr 280px") : (cinemaSwap ? "240px 1fr" : "1fr 240px"), gap: 16, height: "100%", animation: "fadeIn .3s", overflow: "hidden", position: "relative" }}>
            {/* Cinema ref anchor */}
            {cinemaMode && (
              <div ref={cinemaRef} style={{ display: "none" }} />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, minWidth: 0, overflow: "hidden", order: cinemaSwap ? 2 : 1 }}>
              {/* BOARD — cards fill cells */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div ref={boardRef} style={{
                  display: "grid", gridTemplateColumns: "repeat(5,1fr)", gridTemplateRows: "repeat(5,1fr)", gap: 2, padding: 2,
                  background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3,
                  maxHeight: "100%", maxWidth: "100%", height: "100%", aspectRatio: "1/1", position: "relative",
                  filter: "none"
                }}>
                  {Array.from({ length: 5 }).map((_, vr) => Array.from({ length: 5 }).map((_, vc) => {
                    const mr = curR;
                    const r = (mr === "ai") ? 4 - vr : vr;
                    const c = (mr === "ai") ? 4 - vc : vc;
                    const cell = game.bd[r][c];
                    const h = isH(r, c); const sel = selB && selB[0] === r && selB[1] === c;

                    // Zone mapping remains consistent to the visual row for bottom playing
                    const zone = vr < 2 ? `${T.curse}06` : vr > 2 ? `${T.bless}06` : "transparent";

                    return (
                      <div key={`${vr}-${vc}`} onClick={() => boardClick(vr, vc)} style={{
                        background: h ? T.gridCellHL : sel ? T.silver + "14" : T.gridCell,
                        border: `1px solid ${h ? T.silver + "55" : sel ? T.silver : T.panelBorder}`,
                        borderRadius: 2, cursor: h || cell?.ow === mr ? "pointer" : "default",
                        display: "flex", alignItems: "stretch", justifyContent: "stretch",
                        transition: "all .1s", animation: h ? "glow 1.5s ease-in-out infinite" : cell?.fd ? "trapGlow 2s ease-in-out infinite" : "none",
                        backgroundImage: !cell ? `linear-gradient(135deg,${zone},transparent)` : "none",
                        overflow: "hidden", padding: 1, height: "100%", width: "100%",
                      }}>
                        {cell && <Card card={cell.cd} fill owner={cell.ow} sel={sel} fDown={cell.fd} noRar viewerRole={mr} locale={locale}
                          effStats={cell.cd.type === "being" && !cell.fd ? getEff(cell.cd, game.bd, r, c, cell.ib) : null} />}
                      </div>);
                  }))}
                  {/* Single 3×3 contour rect per terrain card */}
                  {(() => {
                    const VB = 500, pad = 2, gap = 2, cs = (VB - 2 * pad - 4 * gap) / 5;
                    const cx = col => pad + col * (cs + gap), cy = row => pad + row * (cs + gap);
                    const mr = curR; const rects = [];
                    for (let tr = 0; tr < 5; tr++) for (let tc = 0; tc < 5; tc++) {
                      const cl = game.bd[tr][tc];
                      if (!cl?.cd || cl.cd.type !== "field" || cl.fd) continue;
                      const vtr = mr === "ai" ? 4 - tr : tr, vtc = mr === "ai" ? 4 - tc : tc;
                      const r0 = Math.max(0, vtr - 1), c0 = Math.max(0, vtc - 1);
                      const r1 = Math.min(4, vtr + 1), c1 = Math.min(4, vtc + 1);
                      const a = aura(cl.cd);
                      const color = a > 0 ? "#b8a060" : a < 0 ? "#6030a0" : "#6a6050";
                      rects.push({ x: cx(c0), y: cy(r0), w: cx(c1) + cs - cx(c0), h: cy(r1) + cs - cy(r0), color });
                    }
                    if (!rects.length) return null;
                    return (
                      <svg viewBox={`0 0 ${VB} ${VB}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                        {rects.map((rc, i) => <rect key={i} x={rc.x} y={rc.y} width={rc.w} height={rc.h} fill="none" stroke={rc.color} strokeWidth={1.5} opacity={0.18} rx={3} />)}
                      </svg>
                    );
                  })()}
                </div>
              </div>
              {/* Player hand — horizontally scrollable */}
              <div style={{
                flexShrink: 0, minWidth: 0, overflow: "hidden",
                padding: "4px 6px 2px", background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3,
                maxHeight: cinemaMode ? 130 : 174,
                ...(cinemaMode ? { maxWidth: "calc(100vh - 200px)", alignSelf: cinemaSwap ? "flex-end" : "flex-start" } : {})
              }}>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", overflowY: "hidden", paddingTop: 2, paddingBottom: 4 }}>
                  {(() => {
                    const mr = curR;
                    const mhk = mr === "player" ? "pH" : "aH";
                    return game[mhk].map((card, i) => (
                      <div key={i} style={{ position: "relative", display: "inline-block" }}>
                        {i < 9 && <div style={{ position: "absolute", top: -2, right: 3, zIndex: 10, fontFamily: FONT_UI, fontSize: 8, fontWeight: 900, color: selH === i ? T.silverBright : T.textDim, pointerEvents: "none", transition: "color 0.12s", textShadow: selH === i ? `0 0 6px ${T.silverBright}` : "none" }}>{i + 1}</div>}
                        <Card card={card} sz={cinemaMode ? 85 : 110} sel={selH === i} noRar locale={locale}
                          onClick={() => game.turn === mr && !aiR ? selectHand(i) : null} />
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
            {/* Controls panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minHeight: 0, height: "100%", overflow: "hidden", order: cinemaSwap ? 1 : 2 }}>
              {/* Top: turn info */}
              <div style={{ padding: "10px 12px", background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: FONT_UI, fontSize: 9, color: T.textDim, letterSpacing: 3, fontWeight: 700, textTransform: "uppercase" }}>{jp ? "ターン" : "TURN"} {game.tn}</div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 8, color: T.textDim, letterSpacing: 2, fontWeight: 600 }}>{game[curR === "player" ? "pD" : "aD"].length} {jp ? "枚" : "in deck"}</div>
                </div>
                <div style={{ fontFamily: FONT_UI, fontSize: 22, fontWeight: 900, color: game.turn === curR ? T.silverBright : T.textDim, marginTop: 4, letterSpacing: 1 }}>
                  {game.ph === "over" ? t(game.win === curR ? "✦ VICTORY" : "▽ DEFEAT") : t(game.turn === curR ? "Your Turn" : "Opponent...")}</div>
                {game.ph === "playing" && (
                  <div style={{ display: "flex", gap: 7, marginTop: 8, opacity: game.turn === curR ? 1 : 0.5 }}>
                    {Array.from({ length: actionsPerTurn }, (_, i) => i).map(i => (<div key={i} style={{
                      width: 18, height: 18, transform: "rotate(45deg)",
                      background: i < game.act ? (game.turn === curR ? T.silverBright : T.silverDim) : T.panelBorder,
                      border: `1.5px solid ${i < game.act ? (game.turn === curR ? T.white : T.silverDim) : T.panelBorder}`,
                      transition: "all .2s"
                    }} />))}
                  </div>)}
                <div style={{ marginTop: 10 }}>
                  <CDisp value={game.c} label={jp ? (game.c === 0 ? "余剰" : game.c > 0 ? "上昇" : "堕落") : (game.c === 0 ? "EXCESS" : game.c > 0 ? "ASCENSION" : "CORRUPTION")} cMax={C_MAX} locale={locale} />
                </div>
              </div>
              {/* Inspect panel — shows when clicking a board cell */}
              {inspCell && game.bd[inspCell[0]]?.[inspCell[1]] && (() => {
                const ic = game.bd[inspCell[0]][inspCell[1]];
                const eff = ic.cd.type === "being" ? getEff(ic.cd, game.bd, inspCell[0], inspCell[1], ic.ib) : null;
                const mr = curR;
                const isSecret = ic.fd && ic.ow !== mr;

                return (
                  <div style={{ padding: 4, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, flexShrink: 0, animation: "fadeIn .2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 9, fontFamily: FONT_UI, fontWeight: 800, color: T.textBright }}>{isSecret ? t("SECRET") : (ic.cd.name || (jp ? (JP_TYPES[ic.cd.type] ?? ic.cd.type) : ic.cd.type))}</div>
                      <button onClick={() => setInspCell(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10 }}>x</button>
                    </div>
                    <div style={{ display: "flex", gap: 3, marginTop: 2, alignItems: "center" }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 3, border: `1px solid ${T.panelBorder}`, flexShrink: 0,
                        background: isSecret ? T.card : (ic.cd.image ? `url(${ic.cd.image}) center/cover` : T.card)
                      }}>
                        {isSecret && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT_TITLE, color: T.silverDim, fontSize: 16 }}>T</div>}
                      </div>
                      <div>
                        <div style={{ fontSize: 7, color: isSecret ? T.textDim : TC[ic.cd.type], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800 }}>
                          {isSecret ? t("HIDDEN") : `${jp ? (JP_TYPES[ic.cd.type] ?? ic.cd.type) : ic.cd.type} (${t(ic.ow === mr ? "You" : "Opp")})`}
                        </div>
                        {!isSecret && (<>
                          {eff && <div style={{ display: "flex", gap: 4, marginTop: 1 }}>
                            {STAT_DEFS.map(s => {
                              const v = eff[s.key]; return (
                                <span key={s.key} style={{
                                  fontSize: 10, fontFamily: FONT_UI, fontWeight: 900,
                                  color: v > 0 ? s.color : v < 0 ? T.curse : T.textDim
                                }}>{s.label}{v > 0 ? "+" : ""}{v}</span>);
                            })}
                          </div>}
                          {(ic.cd.type === "bless" || ic.cd.type === "curse") && <div style={{
                            fontSize: 9, fontFamily: FONT_UI, fontWeight: 900,
                            color: ic.cd.type === "bless" ? T.bless : T.curse
                          }}>{ic.cd.type === "bless" ? "+" : "-"}{cPwr(ic.cd)}C {ic.fd ? (jp ? "(罠)" : "(TRAP)") : ""}</div>}
                        </>)}
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
              <div ref={logRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 4, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3 }}>
                {log.map((m, i) => (<div key={i} style={{ color: m.includes("⚔") ? "#a06070" : m.includes("✦") || m.includes("⟐") ? T.silverBright : m.includes("⚡") ? T.curse : m.includes("✧") ? T.bless : T.textDim, lineHeight: 1.3, fontSize: 10 }}>{m}</div>))}
              </div>
              {/* Controls — at bottom */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                {game.ph === "playing" && isMyTurn() && !aiR && (<>
                  {(mode === "bless" || mode === "curse") && selH !== null && (<>
                    <button onClick={() => playBC(mode)} style={B(mode === "bless" ? T.bless : T.curse)}>
                      {mode === "bless" ? "△" : "▽"} {jp ? "発動" : "Play"} ({game.c === 0 && game.cMoved ? (jp ? "無料" : "FREE") : cPwr(game[curR === "player" ? "pH" : "aH"][selH])})</button>
                    <button onClick={doSetTrap} style={B(T.silverDim)}>▼ {jp ? "伏せ（無料）" : "Set (FREE)"}</button></>)}
                  {mode === "equip" && selH !== null && (
                    <button onClick={doSetEquip} style={B(T.silverDim)}>▼ {jp ? "装備セット（無料）" : "Set Equip (FREE)"}</button>)}
                  {mode === "playField" && selH !== null && (
                    <button onClick={doSetField} style={B(T.silverDim)}>▼ {jp ? "領域セット（無料）" : "Set Field (FREE)"}</button>)}
                  {mode === "chooseStat" && tapTgt && (
                    <div style={{ display: "flex", gap: 2 }}>
                      {STAT_DEFS.map(s => (<button key={s.key} onClick={() => resolveTap(s.key)} style={{
                        ...B(s.color), flex: 1, textTransform: "uppercase", letterSpacing: 2
                      }}>{jp ? (JP_STATS[s.key] ?? s.label) : s.label}</button>))}
                    </div>)}
                  <button onClick={drawCard} disabled={game.act <= 0 || !game[curR === "player" ? "pD" : "aD"].length} style={B(T.being, game.act <= 0)}>{jp ? "ドロー" : "Draw"} ({game[curR === "player" ? "pD" : "aD"].length})</button>
                  {mode && <button onClick={clr} style={B(T.textDim)}>{t("Cancel")}</button>}
                  {game.act > 0 && <button onClick={endTurn} style={{ ...B(T.silverBright), letterSpacing: 3, fontSize: 13, marginTop: 4 }}>{t("END TURN")}</button>}
                  {game.act <= 0 && <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, textAlign: "center", opacity: 0.5, marginTop: 4, letterSpacing: 2 }}>{t("ending turn…")}</div>}
                </>)}
                {game.ph === "over" && <>
                  <button onClick={() => { setGame(null); setLog([]); setActionLog([]); }} style={{ ...B(T.silverBright), letterSpacing: 3 }}>{t("NEW GAME")}</button>
                </>}
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button onClick={forfeit} style={{ ...B(T.danger), fontSize: 7, flex: 1 }}>{t("Forfeit")}</button>
                  <button onClick={() => setShowPit(!showPit)} style={{ ...B(T.textDim), fontSize: 7, flex: 1 }}>{jp ? "墓地" : "Pit"} ({pit.player.length + pit.ai.length})</button>
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
              {[["single", "Card"], ["generate", "Set"], ["campaign", "Campaign"], ["decks", "Decks"]].map(([m, l]) => (
                <button key={m} onClick={() => setForgeMode(m)} style={{
                  padding: "5px 14px", border: `1px solid ${forgeMode === m ? T.silverBright : T.panelBorder}`,
                  background: forgeMode === m ? T.silver + "12" : T.panel, borderRadius: 3, cursor: "pointer",
                  color: forgeMode === m ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 9, fontWeight: 700,
                }}>{l}</button>
              ))}
            </div>

            {forgeMode === "single" ? (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, padding: 12, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 10 }}>
                    {nc.image ? (
                      <div onClick={() => setNc(p => ({ ...p, image: null }))} title="Click to remove image" style={{
                        width: 120, height: 120, borderRadius: 3, cursor: "pointer",
                        background: `url(${nc.image}) center/cover`,
                        border: `1.5px solid ${T.panelBorder}`, flexShrink: 0
                      }} />
                    ) : (
                      <label style={{
                        width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1.5px dashed ${T.panelBorder}`, borderRadius: 3, cursor: "pointer",
                        background: `linear-gradient(145deg,${nc.gradient[0]},${nc.gradient[1]})`,
                        fontSize: 18, color: T.textDim
                      }}>＋<input type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} /></label>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} placeholder="Name..." style={{ ...INP, fontSize: 14, padding: "6px 10px" }} />
                      <input value={nc.set} onChange={e => setNc(p => ({ ...p, set: e.target.value }))} placeholder="Set..." style={{ ...INP, fontSize: 14, padding: "6px 10px" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                    {["being", "bless", "curse", "field", "equip"].map(t => (
                      <button key={t} onClick={() => setNc(p => ({ ...p, type: t, gradient: DG[t] || DG.being }))} style={{
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
                  {["being", "field", "equip"].includes(nc.type) && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                      {STAT_DEFS.map(s => (<div key={s.key} style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: s.color, fontFamily: FONT_UI, fontWeight: 800 }}>{s.label}</span>
                          <span style={{ fontSize: 11, color: s.color, fontFamily: FONT_UI, fontWeight: 900 }}>{nc[s.key] > 0 ? "+" : ""}{nc[s.key]}</span></div>
                        <input type="range" min={STAT_MIN} max={STAT_MAX} value={nc[s.key]} onChange={e => setNc(p => ({ ...p, [s.key]: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: s.color }} />
                      </div>))}
                    </div>)}
                  {(nc.type === "bless" || nc.type === "curse") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input type="range" min="1" max="3" value={nc.power} onChange={e => setNc(p => ({ ...p, power: parseInt(e.target.value) }))} style={{ width: 120, accentColor: nc.type === "bless" ? T.bless : T.curse }} />
                      <span style={{ fontSize: 14, color: nc.type === "bless" ? T.bless : T.curse, fontFamily: FONT_UI, fontWeight: 900 }}>{nc.type === "bless" ? "+" : "−"}{nc.power}C</span>
                    </div>)}
                  <button onClick={createCard} style={{ ...B(T.silverBright), letterSpacing: 3, fontSize: 11, width: "100%", padding: "6px 10px" }}>FORGE CARD</button>
                  {/* Unassigned images grid */}
                  {(() => {
                    const assigned = new Set(cardPool.map(c => c.image).filter(Boolean));
                    const free = allImages.filter(p => !assigned.has(p));
                    if (!free.length) return null;
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 8, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, letterSpacing: 2 }}>
                            UNASSIGNED — {free.length}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                            <span style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, letterSpacing: 1 }}>SIZE</span>
                            <input type="range" min="60" max="300" value={forgeImgSize} onChange={e => setForgeImgSize(parseInt(e.target.value))} style={{ width: 80, accentColor: T.silver }} />
                            <span style={{ fontSize: 8, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, minWidth: 26 }}>{forgeImgSize}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 480, overflowY: "auto", padding: 2 }}>
                          {free.map(img => (
                            <div key={img} onClick={() => setNc(p => ({ ...p, image: img }))}
                              title={img.split("/").pop()}
                              style={{
                                width: forgeImgSize, height: forgeImgSize, borderRadius: 3, cursor: "pointer", flexShrink: 0,
                                background: `url(${img}) center/cover`,
                                border: `1.5px solid ${nc.image === img ? T.silverBright : T.panelBorder}`,
                                outline: nc.image === img ? `1px solid ${T.silverBright}` : "none",
                              }} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 200 }}>
                  <Card card={{ ...nc, id: "preview" }} sz={180} />
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: FONT_UI }}>{cardPool.length} cards</div>
                </div>
              </div>
            ) : forgeMode === "generate" ? (
              /* SET GENERATOR */
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", height: "calc(100vh - 120px)" }}>
                <div style={{ width: 360, flexShrink: 0, padding: 12, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, overflowY: "auto", maxHeight: "100%" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, marginBottom: 12 }}>
                    <div><label style={LBL}>SET NAME</label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={gen.name} onChange={e => setGen(p => ({ ...p, name: e.target.value }))} style={{ ...INP, fontSize: 14, padding: "6px 10px", flex: 1 }} />
                        <input type="color" value={gen.color} onChange={e => setGen(p => ({ ...p, color: e.target.value }))} title="Set color" style={{ width: 34, height: 34, border: `1px solid ${T.panelBorder}`, borderRadius: 3, cursor: "pointer", padding: 2, background: T.bg2, flexShrink: 0 }} />
                      </div></div>
                    <div><label style={LBL}>TOTAL CARDS</label>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginTop: 4 }}>
                        <input type="range" min="10" max="2000" value={gen.total} onChange={e => setGen(p => ({ ...p, total: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: T.silver }} />
                        <span style={{ fontFamily: FONT_UI, fontSize: 13, color: T.silverBright, fontWeight: 900, marginTop: 2 }}>{gen.total}</span>
                      </div></div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={LBL}>TYPE DISTRIBUTION</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 4 }}>
                      {[["Being", "pctEntity", TC.being], ["Bless", "pctBless", TC.bless], ["Curse", "pctCurse", TC.curse], ["Equip", "pctItem", TC.item], ["Field", "pctTerrain", TC.field]].map(([label, key, color]) => (
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
                    {[["Blessing Pwr", "blessPwrMin", "blessPwrMax", TC.bless], ["Curse Pwr", "cursePwrMin", "cursePwrMax", TC.curse]].map(([label, minK, maxK, color]) => (
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
                      {[["permute", "All Permutations"], ["random", "Random (rarity >> power)"]].map(([m, l]) => (
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
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                    <button onClick={() => { generateSet(); setGen(p => ({ ...p, name: "New Set " + (sets.length + 1) })); }}
                      style={{ ...B(T.silverBright), letterSpacing: 4, fontSize: 13, flex: 1, padding: "8px 16px" }}>
                      GENERATE {gen.total} → "{gen.name}"
                    </button>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{ fontSize: 6, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 1 }}>SEED</span>
                      <input type="number" value={genSeed} onChange={e => setGenSeed(parseInt(e.target.value) || 1)}
                        style={{ width: 52, background: "transparent", color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${T.panelBorder}`, borderRadius: 2, padding: "4px 5px", outline: "none", textAlign: "center" }} />
                    </div>
                  </div>
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
                          {["being", "bless", "curse", "field", "equip"].map(t => {
                            const n = livePreview.filter(c => c.type === t).length;
                            return n ? <span key={t} style={{ color: TC[t] || T.text, marginLeft: 6 }}>{n} {t.slice(0, 3)}</span> : null;
                          })}
                        </div>
                      </div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, fontFamily: FONT_UI }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${T.panelBorder}`, position: "sticky", top: 0, background: T.panel }}>
                          {["#", "Art", "Type", "Uniq", "S", "M", "W", "|Pwr|", "Aura", "Rar", "C Pwr"].map(h => (
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
                              <td style={{ padding: "1px 4px", color: T.textBright }}>{c.isUnique ? "✧" : "·"}</td>
                              <td style={{ padding: "1px 4px", color: c.soul > 0 ? STAT_DEFS[0].color : c.soul < 0 ? T.curse : T.textDim }}>{c.soul || "·"}</td>
                              <td style={{ padding: "1px 4px", color: c.mind > 0 ? STAT_DEFS[1].color : c.mind < 0 ? T.curse : T.textDim }}>{c.mind || "·"}</td>
                              <td style={{ padding: "1px 4px", color: c.will > 0 ? STAT_DEFS[2].color : c.will < 0 ? T.curse : T.textDim }}>{c.will || "·"}</td>
                              <td style={{ padding: "1px 4px", color: T.silverBright, fontWeight: 800 }}>{pwr || "·"}</td>
                              <td style={{ padding: "1px 4px", color: au > 0 ? T.light : au < 0 ? T.dark : T.balanced }}>{ori === "✡" ? <span style={{ fontSize: "1.3em", lineHeight: 1 }}>✡</span> : ori}{au || ""}</td>
                              <td style={{ padding: "1px 4px", color: RC[c.rarity] }}>{c.rarity?.[0]?.toUpperCase()}</td>
                              <td style={{ padding: "1px 4px", color: c.power ? (c.type === "bless" ? TC.bless : TC.curse) : T.textDim }}>{c.power || "·"}</td>
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
            ) : forgeMode === "campaign" ? (
              /* CAMPAIGN GENERATOR */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* ── Controls strip (fixed-width columns, h-scroll if needed) ── */}
                <div style={{ overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: 0, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, alignItems: "stretch", minWidth: "max-content" }}>

                    {/* Col 1: Cards/set + dist mode + generate — 175px */}
                    <div style={{ width: 175, flexShrink: 0, padding: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                      <label style={LBL}>AVG CARDS / SET</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="number" min="10" max="2000" value={camGen.cardsPerSet} onChange={e => setCamGen(p => ({ ...p, cardsPerSet: Math.max(10, Math.min(2000, parseInt(e.target.value) || 10)) }))} style={{ width: 80, background: T.bg3 || T.bg2, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 13, border: `1px solid ${T.silver}55`, borderRadius: 2, padding: "2px 6px" }} />
                      </div>
                      <div style={{ fontSize: 7, color: T.textDim }}>{camGen.cardsPerSet * CAMPAIGN_SET_IDS.length} total</div>
                      <label style={LBL}>DISTRIBUTION</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {[["uniform", "Uniform"], ["bell", "Bell (mid heavy)"], ["ramp", "Ramp (A→Z grows)"], ["ramp_inv", "Ramp (A→Z shrinks)"]].map(([m, l]) => (
                          <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 7, color: camGen.distMode === m ? T.silverBright : T.textDim, fontFamily: FONT_UI }}>
                            <input type="radio" name="distMode" checked={camGen.distMode === m} onChange={() => setCamGen(p => ({ ...p, distMode: m }))} style={{ accentColor: T.silverBright }} />
                            {l}
                          </label>
                        ))}
                      </div>
                      {camGen.distMode === "bell" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, flexShrink: 0 }}>Spread</span>
                          <input type="range" min="10" max="100" value={camGen.bellSpread} onChange={e => setCamGen(p => ({ ...p, bellSpread: parseInt(e.target.value) }))} style={{ width: 70, accentColor: T.silver }} />
                          <span style={{ fontSize: 9, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, minWidth: 20 }}>{camGen.bellSpread}</span>
                        </div>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 7, color: T.textBright, fontFamily: FONT_UI, marginTop: 2 }}>
                        <input type="checkbox" checked={camGen.ensureTypes} onChange={e => setCamGen(p => ({ ...p, ensureTypes: e.target.checked }))} style={{ accentColor: T.silverBright }} />
                        ENSURE TYPES
                      </label>
                      <button onClick={generateCampaign} style={{ ...B(T.legendary), letterSpacing: 2, fontSize: 10, padding: "7px 8px", marginTop: 4 }}>
                        ✦ GENERATE
                      </button>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 6, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 1 }}>SEED</span>
                        <input type="number" value={camSeed} onChange={e => setCamSeed(parseInt(e.target.value) || 1)}
                          style={{ width: 52, background: "transparent", color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${T.panelBorder}`, borderRadius: 2, padding: "3px 5px", outline: "none", textAlign: "center" }} />
                      </div>
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 2: Entity power ramp — 205px */}
                    <div style={{ width: 205, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>ENTITY POWER (|S|+|M|+|W|)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        {[["A", "startPowerMin", "startPowerMax", T.silverDim], ["Z", "endPowerMin", "endPowerMax", T.silverBright]].map(([label, minK, maxK, color]) => (
                          <div key={label} style={{ padding: "4px 6px", background: T.bg2, borderRadius: 3, border: `1px solid ${color}28` }}>
                            <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                            {[[minK, "↓"], [maxK, "↑"]].map(([k, lb]) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: 7, color: T.textDim, width: 8, flexShrink: 0 }}>{lb}</span>
                                <input type="number" min="0" max="9" value={camGen[k]} onChange={e => { const v = Math.max(0, Math.min(9, parseInt(e.target.value) || 0)); setCamGen(p => k.endsWith("Min") ? { ...p, [k]: Math.min(v, p[maxK]) } : { ...p, [k]: Math.max(v, p[minK]) }); }} style={{ width: 50, background: T.bg3 || T.bg2, color, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${color}55`, borderRadius: 2, padding: "1px 4px" }} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div style={{ height: 2, borderRadius: 1, marginTop: 4, background: `linear-gradient(to right, ${T.silverDim}, ${T.silverBright})` }} />
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 3: Bless/Curse/Equip/Terr power — 220px */}
                    <div style={{ width: 220, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>BLESS / CURSE / EQUIP / TERR PWR</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                        {[
                          ["Bless A", "startBlessPwrMin", "startBlessPwrMax", TC.bless], ["Bless Z", "endBlessPwrMin", "endBlessPwrMax", TC.bless],
                          ["Curse A", "startCursePwrMin", "startCursePwrMax", TC.curse], ["Curse Z", "endCursePwrMin", "endCursePwrMax", TC.curse],
                          ["Equip A", "startEquipPwrMin", "startEquipPwrMax", TC.equip], ["Equip Z", "endEquipPwrMin", "endEquipPwrMax", TC.equip],
                          ["Terr A", "startTerrPwrMin", "startTerrPwrMax", TC.field], ["Terr Z", "endTerrPwrMin", "endTerrPwrMax", TC.field],
                        ].map(([label, minK, maxK, color]) => (
                          <div key={label} style={{ padding: "4px 6px", background: T.bg2, borderRadius: 3, border: `1px solid ${color}22` }}>
                            <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                            {[[minK, "↓"], [maxK, "↑"]].map(([k, lb]) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: 7, color: T.textDim, width: 8, flexShrink: 0 }}>{lb}</span>
                                <input type="number" min="1" max="9" value={camGen[k]} onChange={e => { const v = Math.max(1, Math.min(9, parseInt(e.target.value) || 1)); setCamGen(p => k.endsWith("Min") ? { ...p, [k]: Math.min(v, p[maxK]) } : { ...p, [k]: Math.max(v, p[minK]) }); }} style={{ width: 50, background: T.bg3 || T.bg2, color, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${color}55`, borderRadius: 2, padding: "1px 4px" }} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 4: Type distribution — 160px */}
                    <div style={{ width: 160, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>TYPE DISTRIBUTION</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                        {[["Ent", "pctEntity", TC.being], ["Bless", "pctBless", TC.bless], ["Curse", "pctCurse", TC.curse], ["Equip", "pctItem", TC.equip], ["Terr", "pctTerrain", TC.field]].map(([label, key, color]) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, width: 30, flexShrink: 0 }}>{label}</span>
                            <input type="number" min="0" max="100" value={camGen[key]} onChange={e => setCamGen(p => ({ ...p, [key]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))} style={{ width: 55, background: T.bg3 || T.bg2, color, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${color}55`, borderRadius: 2, padding: "1px 4px" }} />
                            <span style={{ fontSize: 9, color, fontFamily: FONT_UI, fontWeight: 900, width: 14, flexShrink: 0 }}>%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 5: Rarity ramp — 245px */}
                    <div style={{ width: 245, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>RARITY RAMP</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        {[["SET A", "startRarCommon", "startRarUncommon", "startRarRare", "startRarLegendary", T.silverDim], ["SET Z", "endRarCommon", "endRarUncommon", "endRarRare", "endRarLegendary", T.silverBright]].map(([label, ck, uk, rk, lk, color]) => (
                          <div key={label} style={{ padding: "4px 6px", background: T.bg2, borderRadius: 3, border: `1px solid ${color}28` }}>
                            <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 3 }}>{label}</div>
                            {[[ck, "C", RC.common], [uk, "U", RC.uncommon], [rk, "R", RC.rare], [lk, "L", RC.legendary]].map(([k, lb, rc]) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
                                <span style={{ fontSize: 7, color: rc, fontFamily: FONT_UI, fontWeight: 800, width: 8, flexShrink: 0 }}>{lb}</span>
                                <input type="number" min="0" max="100" value={camGen[k]} onChange={e => setCamGen(p => ({ ...p, [k]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))} style={{ width: 55, background: T.bg3 || T.bg2, color: rc, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${rc}55`, borderRadius: 2, padding: "1px 4px" }} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>

                {/* ── Preview table ── */}
                <div style={{ padding: "8px 10px", background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4 }}>
                  <label style={LBL}>SET PROGRESSION PREVIEW</label>
                  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 480, marginTop: 6 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT_UI, minWidth: 640 }}>
                      <thead style={{ position: "sticky", top: 0, background: T.panel, zIndex: 1 }}>
                        <tr style={{ borderBottom: `1px solid ${T.panelBorder}` }}>
                          {[["Set", T.textDim], ["Ent.Pwr", T.being], ["E.±", T.being], ["Bless", TC.bless], ["Curse", TC.curse], ["Equip", TC.equip], ["Terr", TC.field], ["Cards", T.textDim], ["C%", RC.common], ["U%", RC.uncommon], ["R%", RC.rare], ["L%", RC.legendary]].map(([h, color]) => (
                            <th key={h} style={{ textAlign: "left", padding: "4px 8px", color, fontWeight: 700, fontSize: 9, letterSpacing: 1, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {campaignPreview.map(({ setId, si, cards, powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax, equipPwrMin, equipPwrMax, terrPwrMin, terrPwrMax, rarCommon, rarUncommon, rarRare, rarLegendary }) => {
                          const setObj = sets.find(s => s.id === setId);
                          const totalW = rarCommon + rarUncommon + rarRare + rarLegendary || 1;
                          const statMax = Math.min(STAT_MAX, powerMax);
                          return (
                            <tr key={setId} style={{ background: si % 2 === 0 ? T.bg2 : "transparent", borderBottom: `1px solid ${T.panelBorder}28` }}>
                              <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                                <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 2, background: setObj?.color || T.panel, marginRight: 6, verticalAlign: "middle" }} />
                                <span style={{ color: T.textBright, fontWeight: 800 }}>{setObj?.name || setId}</span>
                              </td>
                              <td style={{ padding: "5px 8px", color: T.being, fontWeight: 700 }}>{powerMin}–{powerMax}</td>
                              <td style={{ padding: "5px 8px", color: T.being }}>±{statMax}</td>
                              <td style={{ padding: "5px 8px", color: TC.bless, fontWeight: 700 }}>{blessPwrMin}–{blessPwrMax}C</td>
                              <td style={{ padding: "5px 8px", color: TC.curse, fontWeight: 700 }}>{cursePwrMin}–{cursePwrMax}C</td>
                              <td style={{ padding: "5px 8px", color: TC.equip }}>±{equipPwrMin}–{equipPwrMax}</td>
                              <td style={{ padding: "5px 8px", color: TC.field }}>±{terrPwrMin}–{terrPwrMax}×2</td>
                              <td style={{ padding: "5px 8px", color: cards !== camGen.cardsPerSet ? T.silverBright : T.textDim, fontWeight: cards !== camGen.cardsPerSet ? 800 : 400 }}>{cards}</td>
                              <td style={{ padding: "5px 8px", color: RC.common, fontWeight: 700 }}>{Math.round(rarCommon / totalW * 100)}%</td>
                              <td style={{ padding: "5px 8px", color: RC.uncommon, fontWeight: 700 }}>{Math.round(rarUncommon / totalW * 100)}%</td>
                              <td style={{ padding: "5px 8px", color: RC.rare, fontWeight: 700 }}>{Math.round(rarRare / totalW * 100)}%</td>
                              <td style={{ padding: "5px 8px", color: RC.legendary, fontWeight: 700 }}>{Math.round(rarLegendary / totalW * 100)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 7, color: T.textDim, fontFamily: FONT_UI }}>
                    {campaignPreview.reduce((s, r) => s + r.cards, 0)} total placeholder cards · blank names & art · ready to customize
                  </div>
                </div>
              </div>
            ) : null}
            {forgeMode === "decks" && (() => {
              const { count, deckSize, factionMode } = autoGenCfg;
              const ds = deckSize;
              const STRATS = [
                ["Balanced", 0.60, 0.20, 0.15, 0.35],
                ["Aggro",    0.65, 0.14, 0.16, 0.20],
                ["Control",  0.50, 0.30, 0.15, 0.50],
                ["Tempo",    0.55, 0.20, 0.20, 0.25],
              ];
              const toRoman = n => { const v=[1000,900,500,400,100,90,50,40,10,9,5,4,1],s=["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"]; let r=""; v.forEach((val,i)=>{ while(n>=val){r+=s[i];n-=val;} }); return r; };
              const lbl = { fontFamily: FONT_UI, fontSize: 9, fontWeight: 800, color: T.silver, letterSpacing: 2 };
              const pill = (active, col) => ({
                padding: "2px 7px", borderRadius: 2, cursor: "pointer", fontFamily: FONT_UI, fontSize: 10, fontWeight: 800,
                border: `1px solid ${active ? (col || T.silverBright) : T.panelBorder}`,
                background: active ? (col || T.silver) + "18" : "transparent",
                color: active ? (col || T.silverBright) : T.textDim,
              });
              const previews = Array.from({ length: Math.min(count, 16) }, (_, i) => {
                const [arch, entPct, bcPct, equPct, oneCR] = STRATS[i % STRATS.length];
                const faction = count === 1 ? (factionMode === "curse" ? "curse" : factionMode === "rand" ? "random" : "bless") : (i % 2 === 0 ? "bless" : "curse");
                const bcSlots = Math.max(5, Math.round(ds * bcPct));
                const equSlots = Math.max(3, Math.round(ds * equPct));
                const terrSlots = 2;
                const entSlots = Math.max(4, ds - bcSlots - equSlots - terrSlots);
                const oneCSlots = Math.round(bcSlots * oneCR);
                return { name: toRoman(decks.length + i + 1), arch, faction, entSlots, bcSlots, oneCSlots, highCSlots: bcSlots - oneCSlots, equSlots, terrSlots, total: entSlots + bcSlots + equSlots + terrSlots };
              });
              const fCol = f => f === "bless" ? T.bless : f === "curse" ? T.curse : T.silver;
              const fSym = f => f === "bless" ? "△" : f === "curse" ? "▽" : "✡";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Config row */}
                  <div style={{ padding: "9px 12px", background: "#07070a", border: `1px solid ${T.silverDim}45`, borderRadius: 3, display: "flex", flexDirection: "column", gap: 7, width: "fit-content" }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={lbl}>DECKS</span>
                      {[1, 2, 4, 8, 16, 32, 64].map(n => (
                        <button key={n} onClick={() => setAutoGenCfg(p => ({ ...p, count: n }))} style={pill(count === n)}>{n}</button>
                      ))}
                      <span style={{ ...lbl, marginLeft: 6 }}>SIZE</span>
                      <input type="number" min={20} max={80} key={ds} defaultValue={ds}
                        onBlur={e => setAutoGenCfg(p => ({ ...p, deckSize: Math.max(20, Math.min(80, parseInt(e.target.value) || 30)) }))}
                        style={{ width: 42, background: "transparent", color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${T.panelBorder}`, borderRadius: 2, padding: "2px 5px", outline: "none" }} />
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {count === 1 ? (
                        [["bless", "△ Ascension", T.bless], ["curse", "▽ Corruption", T.curse], ["rand", "✡ Fated", T.silver]].map(([v, l, col]) => (
                          <button key={v} onClick={() => setAutoGenCfg(p => ({ ...p, factionMode: v }))} style={{ ...pill(factionMode === v, col), boxShadow: factionMode === v ? `0 0 10px ${col}28` : "none" }}>{l}</button>
                        ))
                      ) : (
                        <span style={{ fontSize: 9, color: T.silver, fontFamily: FONT_UI }}>△ ×{count / 2} · ▽ ×{count / 2}</span>
                      )}
                      <button onClick={() => setAutoGenCfg(p => ({ ...p, artOnly: !p.artOnly }))} style={{ ...pill(autoGenCfg.artOnly, T.silverBright), marginLeft: 6 }}>Art Only</button>
                      <button onClick={generateStructureDecks} style={{ ...pill(true), marginLeft: 4, padding: "3px 18px", letterSpacing: 3, fontSize: 11, color: T.silverBright, border: `1px solid ${T.silverDim}` }}>BUILD</button>
                    </div>
                  </div>
                  {/* Preview grid — wraps to next line naturally */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {previews.map((p, i) => (
                      <div key={i} style={{ width: 100, flexShrink: 0, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, overflow: "hidden" }}>
                        {/* Header */}
                        <div style={{ padding: "5px 8px", borderBottom: `1px solid ${T.panelBorder}`, background: fCol(p.faction) + "10" }}>
                          <div style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 900, color: fCol(p.faction), letterSpacing: 1 }}>{p.name} {fSym(p.faction)}</div>
                          <div style={{ fontFamily: FONT_UI, fontSize: 7, color: T.textDim, marginTop: 1, letterSpacing: 1 }}>{p.arch.toUpperCase()}</div>
                        </div>
                        {/* Stats */}
                        <div style={{ padding: "5px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                          {[
                            ["Total",   p.total,             T.silverBright, true],
                            ["Being",  `${p.entSlots} ±2`,  TC.being,      false],
                            ["Spell",   `${p.bcSlots} ±2`,   fCol(p.faction),false],
                            [" 1C",     `~${p.oneCSlots}`,   T.textDim,      false],
                            [" Hi-C",   `~${p.highCSlots}`,  T.textDim,      false],
                            ["Equip",   `${p.equSlots} ±2`,  TC.equip,       false],
                            ["Field", p.terrSlots,          TC.field,     false],
                          ].map(([lbl, v, c, bold]) => (
                            <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <span style={{ fontFamily: FONT_UI, fontSize: 7, color: T.textDim, fontWeight: 700 }}>{lbl}</span>
                              <span style={{ fontFamily: FONT_UI, fontSize: bold ? 10 : 8, color: c, fontWeight: bold ? 900 : 500 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        {/* Ratio bar */}
                        <div style={{ display: "flex", height: 5, margin: "0 8px 7px" }}>
                          <div style={{ flex: p.entSlots, background: TC.being, opacity: 0.85 }} />
                          <div style={{ flex: p.bcSlots, background: fCol(p.faction), opacity: 0.85 }} />
                          <div style={{ flex: p.equSlots, background: TC.equip, opacity: 0.85 }} />
                          <div style={{ flex: p.terrSlots, background: TC.field, opacity: 0.85 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>)}

        {/* ═══ DECKS ═══ */}
        <div style={{ display: tab === "decks" ? undefined : "none" }}>
          {!editDeck ? (<>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ fontFamily: FONT_UI, fontSize: 14, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>DECKS</h2>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setDecks(p => [...p, { name: "New Deck", cards: [] }]); setEditDeck({ idx: decks.length }); }} style={B(T.silverBright)}>+ New</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
              {decks.map((d, i) => (
                <div key={i} style={{ position: "relative", padding: 10, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, cursor: "pointer" }} onClick={() => setEditDeck({ idx: i })}>
                  <button onClick={e => { e.stopPropagation(); setDecks(p => p.filter((_, j) => j !== i)); }} style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 11, padding: 0, lineHeight: 1, opacity: 0.5 }} title="Delete">×</button>
                  <div style={{ fontFamily: FONT_UI, fontSize: 12, color: T.textBright, fontWeight: 700, marginBottom: 3, paddingRight: 18 }}>{d.name}</div>
                  <div style={{ fontSize: 10, color: T.textDim }}>{d.cards.length}/{DECK_SIZE} cards</div>
                </div>
              ))}
            </div></>
          ) : (<>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <button onClick={() => setEditDeck(null)} style={B(T.textDim)}>←</button>
              <input value={decks[editDeck.idx]?.name || ""} onChange={e => { const u = [...decks]; u[editDeck.idx] = { ...u[editDeck.idx], name: e.target.value }; setDecks(u); }}
                style={{ ...INP, fontFamily: FONT_UI, fontSize: 13, flex: 1, fontWeight: 700 }} />
              <span style={{ fontSize: 11, color: T.textDim, fontWeight: 700, whiteSpace: "nowrap" }}>{decks[editDeck.idx]?.cards.length}/{DECK_SIZE}</span>
              <div style={{ display: "flex", gap: 3 }}>
                {["type", "rarity", "aura"].map(mode => (
                  <button key={mode} onClick={() => setDeckSortMode(mode)} style={{ padding: "4px 10px", border: `1px solid ${deckSortMode === mode ? T.silverBright : T.panelBorder}`, background: deckSortMode === mode ? T.silver + "20" : T.panel, borderRadius: 3, cursor: "pointer", color: deckSortMode === mode ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>{mode}</button>
                ))}
              </div>
            </div>
            {(() => {
              const aura = c => (c.soul || 0) + (c.mind || 0) + (c.will || 0);
              const auraOrder = c => {
                if (c.type !== "being") return 3;
                const a = aura(c); return a === 0 ? 0 : a < 0 ? 1 : 2;
              };
              const sortCards = (cardsArray) => {
                const tOrder = { being: 1, bless: 2, curse: 3, equip: 4, field: 5 };
                return [...cardsArray].sort((a, b) => {
                  if (deckSortMode === "aura") {
                    if (auraOrder(a) !== auraOrder(b)) return auraOrder(a) - auraOrder(b);
                    if (a.type !== "being" && b.type !== "being" && tOrder[a.type] !== tOrder[b.type]) return (tOrder[a.type] || 99) - (tOrder[b.type] || 99);
                    return Math.abs(aura(a)) - Math.abs(aura(b));
                  }
                  if (deckSortMode === "rarity" && a.rarity !== b.rarity) return RO.indexOf(b.rarity) - RO.indexOf(a.rarity);
                  if (tOrder[a.type] !== tOrder[b.type]) return (tOrder[a.type] || 99) - (tOrder[b.type] || 99);
                  const pA = cPwr(a), pB = cPwr(b);
                  if (pA !== pB) return pB - pA;
                  return a.id.localeCompare(b.id);
                });
              };
              const ownedCards = sortCards(ownedCardPool);
              const deckCards = sortCards((decks[editDeck.idx]?.cards || []).map(id => cardMap.get(id)).filter(Boolean));
              return (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, alignItems: "start" }}>
                  {/* COLLECTION panel */}
                  <div style={{ background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, padding: 8 }}>
                    <div style={{ ...LBL, marginBottom: 4, fontSize: 9 }}>COLLECTION <span style={{ color: T.textDim, fontWeight: 400 }}>— click to add</span></div>
                    <div style={{ marginBottom: 6 }}>{renderStatFilter(deckStatF, setDeckStatF)}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {ownedCards.filter(c => STAT_DEFS.every(s => deckStatF[s.key] === null || (c[s.key] || 0) === deckStatF[s.key])).map((card, idx) => {
                        const inDk = decks[editDeck.idx]?.cards.filter(id => id === card.id).length || 0;
                        const avail = owned(card.id) - inDk;
                        const isSpell = card.type === "bless" || card.type === "curse";
                        const deckSpellPwr = (decks[editDeck.idx]?.cards || []).reduce((sum, id) => { const c = cardMap.get(id); return (c?.type === "bless" || c?.type === "curse") ? sum + cPwr(c) : sum; }, 0);
                        const budgetExceeded = isSpell && deckSpellPwr + cPwr(card) > spellBudget;
                        return (<div key={`${card.id}_${idx}`} style={{ position: "relative" }}>
                          <Card card={card} sz={62} dim={avail <= 0 || budgetExceeded} onClick={() => {
                            if (avail <= 0 || budgetExceeded) return; const dk = decks[editDeck.idx];
                            if (dk.cards.length >= DECK_SIZE || inDk >= MAX_COPIES) return;
                            const u = [...decks]; u[editDeck.idx] = { ...dk, cards: [...dk.cards, card.id] }; setDecks(u);
                          }} />
                          <div style={{
                            position: "absolute", top: 1, right: 1, minWidth: 13, height: 13, background: avail > 0 ? T.silverBright : T.danger, borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#000", fontWeight: 800
                          }}>{avail}</div>
                        </div>);
                      })}
                    </div>
                  </div>
                  {/* DECK panel */}
                  <div style={{ background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, padding: 8 }}>
                    {(() => { const sp = (decks[editDeck.idx]?.cards || []).reduce((s, id) => { const c = cardMap.get(id); return (c?.type === "bless" || c?.type === "curse") ? s + cPwr(c) : s; }, 0); return (
                    <div style={{ ...LBL, marginBottom: 6, fontSize: 9 }}>DECK <span style={{ color: T.textDim, fontWeight: 400 }}>{deckCards.length}/{DECK_SIZE} — click to remove</span><span style={{ color: sp >= spellBudget ? T.danger : T.textDim, fontWeight: 400, marginLeft: 6 }}>✦ {sp}/{spellBudget}</span></div>
                    ); })()}
                    {deckCards.length === 0
                      ? <div style={{ fontSize: 9, color: T.textDim, padding: "12px 0", textAlign: "center" }}>Add cards from your collection</div>
                      : <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {deckCards.map((card, i) => (
                          <Card key={`${card.id}_${i}`} card={card} sz={62} onClick={() => {
                            const u = [...decks]; const cards = [...u[editDeck.idx].cards];
                            const origIdx = cards.indexOf(card.id);
                            if (origIdx !== -1) cards.splice(origIdx, 1);
                            u[editDeck.idx] = { ...u[editDeck.idx], cards }; setDecks(u);
                          }} />
                        ))}
                      </div>
                    }
                  </div>
                </div>
              );
            })()}</>)}
        </div>

        {/* ═══ CODEX ═══ */}
        <div style={{ display: tab === "browse" ? undefined : "none" }}>
          <div style={{ display: "flex", gap: 3, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>CODEX</h2>
            <div style={{ marginLeft: "auto", display: "flex", gap: 1 }}>
              {["all", "being", "bless", "curse", "equip", "field"].map(f => (
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
          <div style={{ marginBottom: 4 }}>{renderStatFilter(bStatF, setBStatF)}</div>
          <div style={{ display: "grid", gridTemplateColumns: bDet ? "1fr 220px" : "1fr", gap: 6 }}>
            <VirtualCardGrid cards={browseFiltered} cardWidth={103} rowHeight={120} containerStyle={{ maxHeight: "calc(100vh - 160px)" }} renderCard={card => {
              const isMasked = !owned(card.id) && card.rarity === "legendary";
              return (
                <div key={card.id} style={{ position: "relative" }}>
                  <Card card={card} sz={100} onClick={isMasked ? undefined : () => { setBDet(card); setEditN(null); }} sel={bDet?.id === card.id} notOwned={!owned(card.id)} mask={!owned(card.id)} artMask />
                  {owned(card.id) > 0 && <div style={{
                    position: "absolute", top: -2, right: -2, minWidth: 10, height: 10, background: T.silverBright, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, color: "#000", fontWeight: 800
                  }}>{owned(card.id)}</div>}
                </div>);
            }} />
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
                {bDet.type === "being" && (<>
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
          </div></div>

        {/* ═══ PACKS — no rarity sliders, just pick set & rip ═══ */}
        {tab === "packs" && (
          <div style={{ animation: "fadeIn .3s", zoom: 1.5 }}>
            {(() => {
              const packCost = sets[selSI]?.cost_per_pack ?? PACK_COST; return (<>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>PACKS</h2>
                  <div style={{ fontFamily: FONT_UI, fontSize: 10, color: tokens >= packCost ? T.silverBright : T.curse, fontWeight: 800, animation: tokenFlash ? "tokenGold 0.7s ease-out forwards" : "none" }}>{tokens} TOKENS</div>
                </div>
                <div style={{ display: "flex", gap: 5, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
                  {sets.map((s, i) => (
                    <div key={s.id} onClick={() => { if (selSI === i && packRes.length > 0) { ripPack(s); } else { setSelSI(i); setPackRes([]); setPackFlip([]); setPackSp([]); } }} title={s.name}
                      style={{
                        width: 36, height: 36, borderRadius: 4, cursor: "pointer", flexShrink: 0,
                        background: s.color || T.panel,
                        border: `2px solid ${selSI === i ? T.white : "transparent"}`,
                        boxShadow: selSI === i ? `0 0 10px ${s.color || T.silver}99` : "0 1px 3px #00000066",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "box-shadow 0.15s, border-color 0.15s",
                        animation: selSI === i ? "subtlePulse 2.4s ease-in-out infinite" : "none",
                      }}>
                      <span style={{ fontFamily: FONT_TITLE, fontSize: selSI === i ? 22 : 19, color: parseInt((s.color || "#888").slice(1), 16) > 0x888888 ? "#111" : "#eee", lineHeight: 1, userSelect: "none" }}>
                        {selSI === i ? "" : (s.name[0] || "?").toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, marginTop: 52 }}>
                  {!packRes.length ? (
                    <button onClick={() => sets[selSI]?.cardIds?.length && tokens >= packCost && ripPack(sets[selSI])}
                      disabled={!sets[selSI]?.cardIds?.length || tokens < packCost} style={{
                        padding: "10px 40px", background: "transparent", borderRadius: 3, letterSpacing: 4,
                        border: `1.5px solid ${sets[selSI]?.cardIds?.length && tokens >= packCost ? T.silverBright : T.panelBorder}`,
                        cursor: sets[selSI]?.cardIds?.length && tokens >= packCost ? "pointer" : "not-allowed",
                        fontFamily: FONT_TITLE, fontSize: 18,
                        color: sets[selSI]?.cardIds?.length && tokens >= packCost ? T.white : T.textDim,
                      }}>{!sets[selSI]?.cardIds?.length ? "Empty Set" : tokens >= packCost ? `Open Pack (${packCost} Token${packCost !== 1 ? "s" : ""})` : `Locked (${packCost} Token${packCost !== 1 ? "s" : ""})`}</button>
                  ) : (
                    <div style={{ display: "flex", gap: 16, flexWrap: "nowrap", justifyContent: "center" }}>
                      {packRes.map((card, i) => {
                        const rarShimmer = {
                          common: "shimmerCommon 2s ease-in-out infinite", uncommon: "shimmerUncommon 1.8s ease-in-out infinite",
                          rare: "shimmerRare 1.5s ease-in-out infinite", legendary: "shimmerLegendary 2s ease-in-out infinite"
                        };
                        return (<div key={i} onClick={() => {
                          setPackFlip(p => { const n = [...p]; n[i] = true; return n; });
                          if (card.rarity === "rare" || card.rarity === "legendary") setTimeout(() => setPackSp(p => { const n = [...p]; n[i] = true; return n; }), 100);
                        }}
                          style={{ cursor: "pointer", width: 144, height: 170, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", animation: packFlip[i] ? `packPop .4s ease-out ${i * .12}s both` : "none" }}>
                          {packFlip[i] ? (
                            <div style={{ textAlign: "center", animation: rarShimmer[card.rarity] || "none", borderRadius: 4, padding: 2 }}>
                              <Card card={card} sz={140} sparkle={packSp[i]} />
                              <div style={{
                                fontSize: 9, color: RC[card.rarity], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800, marginTop: 3, letterSpacing: 2,
                                textShadow: card.rarity === "legendary" ? `0 0 12px ${T.legendary}aa` : card.rarity === "rare" ? `0 0 8px ${T.silverBright}44` : "none"
                              }}>{card.rarity}</div></div>
                          ) : (
                            <div style={{
                              width: 140, height: 155, borderRadius: 3, border: `1.5px solid ${T.silverDim}22`,
                              background: T.card, display: "flex", alignItems: "center", justifyContent: "center"
                            }}>
                              <span style={{ fontFamily: FONT_TITLE, fontSize: 42, color: T.silverBright, lineHeight: 1 }}>T</span></div>)}
                        </div>);
                      })}</div>
                  )}
                </div></>);
            })()}
          </div>)}

        {/* ═══ EDITOR — filterable, sortable, with image upload ═══ */}
        {(() => {
          const filtered = editorFiltered;
          return (
            <div style={{ display: tab === "editor" ? undefined : "none" }}>
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
                  {["all", "being", "bless", "curse", "equip", "field"].map(t => (
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
                <button onClick={() => setEdF(p => ({ ...p, art: p.art === "art" ? "all" : "art" }))} style={{
                  padding: "1px 6px", border: `1px solid ${edF.art === "art" ? T.bless : T.panelBorder}`,
                  background: edF.art === "art" ? T.bless + "15" : "transparent", borderRadius: 2,
                  color: edF.art === "art" ? T.bless : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 800,
                }}>Art</button>
                <button onClick={() => { setShowArtPanel(p => !p); if (!showArtPanel) refreshImages(); }} style={{
                  padding: "1px 6px", border: `1px solid ${showArtPanel ? T.silverBright : T.panelBorder}`,
                  background: showArtPanel ? T.silver + "12" : "transparent", borderRadius: 2,
                  color: showArtPanel ? T.silverBright : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 800,
                }}>Art Bank</button>
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
              <div style={{ marginBottom: 4 }}>{renderStatFilter(edF, f => setEdF(p => ({ ...p, ...f(p) })))}</div>

              <div style={{ display: "grid", gridTemplateColumns: `${showArtPanel ? "380px " : ""}1fr${editCard ? " 300px" : ""}`, gap: 8 }}>
                {/* Art Bank — unassigned images panel */}
                {showArtPanel && (() => {
                  const assigned = new Set(cardPool.map(c => c.image).filter(Boolean));
                  const free = allImages.filter(p => !assigned.has(p));
                  return (
                    <div style={{ position: "sticky", top: 0, alignSelf: "start", maxHeight: "calc(100vh - 110px)", overflowY: "auto", padding: 6, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, letterSpacing: 1.5 }}>
                          UNASSIGNED
                        </span>
                        <span style={{ fontSize: 8, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900 }}>{free.length}</span>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}>
                          <input type="range" min="40" max="200" value={forgeImgSize} onChange={e => setForgeImgSize(parseInt(e.target.value))} style={{ width: 50, accentColor: T.silver }} />
                        </div>
                      </div>
                      {!free.length && <div style={{ fontSize: 8, color: T.textDim, padding: 8, textAlign: "center" }}>All images assigned</div>}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, padding: 1 }}>
                        {free.map(img => (
                          <div key={img} draggable
                            onDragStart={e => { e.dataTransfer.setData("text/image-path", img); e.dataTransfer.effectAllowed = "copy"; }}
                            onClick={() => { if (editCard) { updateCard(editCard.id, { image: img }); setEditCard(prev => ({ ...prev, image: img })); } }}
                            title={img.split("/").pop()}
                            style={{
                              width: "100%", aspectRatio: "1/1", borderRadius: 3, cursor: editCard ? "pointer" : "grab",
                              background: `url(${img}) center/cover`,
                              border: `1.5px solid ${T.panelBorder}`,
                              transition: "border-color .15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = T.silverBright; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = T.panelBorder; }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* Card grid — drag images onto cards to assign art */}
                <div onDragOver={e => e.preventDefault()}>
                  {!filtered.length && <div style={{ fontSize: 10, color: T.textDim, padding: 12 }}>No cards match filters.</div>}
                  <VirtualCardGrid cards={filtered} cardWidth={103} rowHeight={120} containerStyle={{ maxHeight: "calc(100vh - 110px)", padding: 2 }} renderCard={card => (
                    <div key={card.id} style={{ position: "relative" }}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px solid ${T.silverBright}`; }}
                      onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
                      onDrop={e => {
                        e.preventDefault(); e.currentTarget.style.outline = "none";
                        const imgPath = e.dataTransfer.getData("text/image-path");
                        if (imgPath) { updateCard(card.id, { image: imgPath }); return; }
                        const files = e.dataTransfer.files;
                        if (files.length && files[0].type.startsWith("image/")) {
                          uploadFile(files[0]).then(path => { if (path) updateCard(card.id, { image: path }); });
                        }
                      }}>
                      <Card card={card} sz={100} onClick={() => setEditCard(card)} sel={editCard?.id === card.id} />
                      {!card.image && <div style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: "50%", background: T.curse }} />}
                    </div>)} />
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
                  return (
                    <div style={{ padding: 10, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, position: "sticky", top: 6, alignSelf: "start", maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px solid ${T.silverBright}`; }}
                          onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
                          onDrop={e => {
                            e.preventDefault(); e.currentTarget.style.outline = "none";
                            const imgPath = e.dataTransfer.getData("text/image-path");
                            if (imgPath) { upd("image", imgPath); return; }
                            const files = e.dataTransfer.files;
                            if (files.length && files[0].type.startsWith("image/")) { uploadFile(files[0]).then(p => { if (p) upd("image", p); }); }
                          }} style={{ borderRadius: 4 }}>
                          <Card card={c} sz={140} />
                          {!c.image && <div style={{ fontSize: 7, color: T.textDim, textAlign: "center", marginTop: 2 }}>drop image here</div>}
                        </div>
                        <button onClick={() => setEditCard(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 14, alignSelf: "start" }}>✕</button>
                      </div>

                      {/* Image upload */}
                      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                        <label style={{ flex: 1, ...B(c.image ? T.being : T.curse), textAlign: "center", cursor: "pointer", fontSize: 9 }}>
                          {c.image ? "Change Art" : "+ Add Art"}
                          <input type="file" accept="image/*" onChange={handleEdImg} style={{ display: "none" }} />
                        </label>
                        {c.image && <button onClick={() => upd("image", null)} style={{ ...B(T.danger), fontSize: 7, padding: "2px 6px" }}>x</button>}
                      </div>

                      <div style={{ marginBottom: 4 }}><label style={LBL}>NAME</label>
                        <input value={c.name || ""} onChange={e => upd("name", e.target.value)} placeholder="Unnamed..." style={INP} /></div>
                      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                        {["being", "bless", "curse", "field", "equip"].map(t => (
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
                      {(c.type === "bless" || c.type === "curse") && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                          <span style={{ fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, width: 30 }}>PWR</span>
                          <input type="range" min="1" max="5" value={c.power || 1} onChange={e => upd("power", parseInt(e.target.value))}
                            style={{ flex: 1, accentColor: c.type === "bless" ? T.bless : T.curse }} />
                          <span style={{ fontSize: 10, color: c.type === "bless" ? T.bless : T.curse, fontFamily: FONT_UI, fontWeight: 900 }}>{c.power || 1}</span>
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

      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{
          position: "fixed", inset: 0, background: "#00000088", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 6,
            padding: "18px 22px", minWidth: 320, maxWidth: 400, maxHeight: "80vh",
            overflowY: "auto", position: "relative"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: FONT_UI, fontSize: 11, letterSpacing: 3, color: T.silverBright, fontWeight: 700 }}>⚙ SETTINGS</div>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>

            <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginBottom: 8 }}>GAME</div>
            {[["Conviction to win", "cMax", 1, 20], ["Actions per turn", "actionsPerTurn", 1, 10], ["Hand size", "handSize", 1, 20]].map(([lbl, key, mn, mx]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>{lbl}</span>
                <input type="number" min={mn} max={mx} value={settings[key]}
                  onChange={e => setSettings(s => ({ ...s, [key]: Math.max(mn, Math.min(mx, parseInt(e.target.value) || mn)) }))}
                  style={{ ...INP, width: 60, textAlign: "center" }} />
              </div>
            ))}

            <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginTop: 10, marginBottom: 8 }}>DECK</div>
            {[["Deck size", "deckSize", 10, 60], ["Max copies", "maxCopies", 1, 4], ["Spell budget", "spellBudget", 1, 30]].map(([lbl, key, mn, mx]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>{lbl}</span>
                <input type="number" min={mn} max={mx} value={settings[key]}
                  onChange={e => setSettings(s => ({ ...s, [key]: Math.max(mn, Math.min(mx, parseInt(e.target.value) || mn)) }))}
                  style={{ ...INP, width: 60, textAlign: "center" }} />
              </div>
            ))}

            <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginTop: 10, marginBottom: 8 }}>ECONOMY</div>
            {[["Starting tokens", "tokensStart", 0, 20], ["Tokens per win", "tokensPerWin", 0, 10], ["Pack cost", "packCost", 0, 10], ["Cards per pack", "cardsPerPack", 1, 10]].map(([lbl, key, mn, mx]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>{lbl}</span>
                <input type="number" min={mn} max={mx} value={settings[key]}
                  onChange={e => setSettings(s => ({ ...s, [key]: Math.max(mn, Math.min(mx, parseInt(e.target.value) || mn)) }))}
                  style={{ ...INP, width: 60, textAlign: "center" }} />
              </div>
            ))}

            <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginTop: 10, marginBottom: 8 }}>MECHANICS</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Tribute summon</span>
              <button onClick={() => setSettings(s => ({ ...s, tributeSummonEnabled: !s.tributeSummonEnabled }))}
                style={{ ...B(settings.tributeSummonEnabled ? T.silverBright : T.textDim), padding: "3px 10px", fontSize: 9 }}>
                {settings.tributeSummonEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Animation style</span>
              <button onClick={() => setSettings(s => {
                if (s.noAnim) return { ...s, noAnim: false, slamAnim: true, cinemaMode: false }; // OFF → Theatre
                if (s.slamAnim && !s.cinemaMode) return { ...s, slamAnim: false, cinemaMode: true }; // Theatre → Cinema
                if (s.cinemaMode) return { ...s, slamAnim: false, cinemaMode: false }; // Cinema → Classic
                return { ...s, noAnim: true, slamAnim: false, cinemaMode: false }; // Classic → OFF
              })}
                style={{ ...B(settings.noAnim ? T.textDim : settings.cinemaMode ? "#6090c0" : T.silver), padding: "3px 10px", fontSize: 9 }}>
                {settings.noAnim ? "OFF" : settings.cinemaMode ? "CINEMA" : settings.slamAnim ? "THEATRE" : "CLASSIC"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Controls side</span>
              <button onClick={() => setSettings(s => ({ ...s, cinemaSwap: !s.cinemaSwap }))}
                style={{ ...B(T.silver), padding: "3px 10px", fontSize: 9 }}>
                {settings.cinemaSwap ? "LEFT" : "RIGHT"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Locale</span>
              <button onClick={() => setSettings(s => ({ ...s, locale: s.locale === "en" ? "jp" : "en" }))}
                style={{ ...B(jp ? "#c060a0" : T.textDim), padding: "3px 10px", fontSize: 9 }}>
                {jp ? "JP" : "EN"}
              </button>
            </div>

            <div style={{ borderTop: `1px solid ${T.panelBorder}`, marginTop: 14, paddingTop: 12, textAlign: "right" }}>
              <button onClick={() => setSettings(DEFAULT_SETTINGS)} style={{ ...B(T.textDim), fontSize: 9 }}>Reset to defaults</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
