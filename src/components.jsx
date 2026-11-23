import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FONT_TITLE, FONT_UI, THEME as T, TYPE_COLORS as TC,
  DEFAULT_GRADS as DG, RARITY_COLORS as RC, STAT_DEFS, C_MAX,
} from "./theme.js";
import { orient, oCol, cPwr, JP, JP_TYPES } from "./gameUtils.js";

export function renderStatFilter(statF, setStatF, vertical = false) {
  const vals = [null, -4, -3, -2, -1, 0, 1, 2, 3, 4];
  const anyActive = STAT_DEFS.some(s => statF[s.key] !== null);
  return (
    <div style={{ display: "flex", gap: vertical ? 3 : 6, alignItems: vertical ? "flex-start" : "center", flexWrap: "wrap", flexDirection: vertical ? "column" : "row" }}>
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

export function Card({ card, sz, fill, onClick, sel, fDown, dim, owner, sparkle, noRar, notOwned, mask, artMask, effStats, viewerRole, locale, banner }) {
  if (!card) return null;
  const jp = locale === "jp";
  const w = fill ? "100%" : sz;
  const h = fill ? "100%" : undefined;
  const fs = fill ? 10 : (sz || 80) < 60 ? 5 : (sz || 80) < 100 ? 7 : (sz || 80) < 150 ? 9 : 11;
  const stripH = fill ? 14 : (sz || 80) < 60 ? 8 : (sz || 80) < 100 ? 10 : (sz || 80) < 150 ? 14 : 18;
  const o = effStats ? orient({ ...card, ...effStats }) : orient(card);
  const bc = sel ? T.silverBright : fDown ? T.textDim : TC[card.type] || T.cardBorder;
  const isMasked = mask && card.rarity === "legendary";
  // An announced attack repaints the stat strip — a faint white on the attacker, solid white (dark ink) on its target
  const ink = banner === "def" ? "#08080c" : null;

  const artStyle = fill
    ? { flex: "1 1 0", minHeight: 0 }  // fill: art takes remaining space after strip
    : { aspectRatio: "1/1", overflow: "hidden" };           // fixed: art is square

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
          ...artStyle,
          backgroundImage: card.image ? `url(${card.image})` :
            `linear-gradient(145deg,${card.gradient?.[0] || DG[card.type]?.[0] || "#333"},${card.gradient?.[1] || DG[card.type]?.[1] || "#111"})`,
          backgroundSize: "cover", backgroundPosition: "center",
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
          background: banner === "atk" ? "#ffffff30" : banner === "def" ? "#fff" : T.card, borderTop: `1px solid ${T.panelBorder}`,
          transition: "background .15s",
        }}>
          {(() => {
            const isSecret = fDown && owner && viewerRole && owner !== viewerRole;
            if (isSecret) return <span style={{ fontSize: fs, color: ink || T.textDim, fontFamily: FONT_UI, fontWeight: 800, width: "100%", textAlign: "center" }}>{jp ? "伏せ" : "SET"}</span>;

            return (<>
              {card.type !== "being" && <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <span style={{
                  fontSize: fs - 1, color: ink || TC[card.type], fontFamily: FONT_UI,
                  textTransform: "uppercase", fontWeight: 800, flexShrink: 0
                }}>{jp ? (JP_TYPES[card.type] ?? card.type) : card.type}</span>
                {(card.type === "bless" || card.type === "curse") && (
                  <span style={{ fontSize: fs, fontFamily: FONT_UI, fontWeight: 900, color: ink || (card.type === "bless" ? T.bless : T.curse) }}>
                    {card.type === "bless" ? "+" : "−"}{cPwr(card)}C
                  </span>
                )}
                {(card.type === "equip" || card.type === "field") && <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
                  {STAT_DEFS.map(s => {
                    const v = card[s.key] || 0; return v !== 0 ? (
                      <span key={s.key} style={{ fontSize: fs, color: ink || (v > 0 ? s.color : T.curse), fontWeight: 800 }}>{s.label}{v > 0 ? "+" : ""}{v}</span>) : null;
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
                      color: ink || (v > 0 ? s.color : v < 0 ? T.curse : T.textDim),
                      textShadow: buffed && !ink ? `0 0 6px ${v > base ? s.color : T.curse}99` : "none",
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
export function Flash({ flash, boardRef, slamAnim = true, cinemaMode = false, cinemaRef, cinemaSwap = false }) {
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

// `range`, when the turn cap is on: [lowest, highest] C can reach before this turn ends
export function CDisp({ value, label, cMax = C_MAX, range, locale }) {
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
      {range && (() => {
        const lo = Math.max(-cMax, range[0]), hi = Math.min(cMax, range[1]), f = v => `${v > 0 ? "+" : ""}${v}`;
        return <div title="How far C can still move before this turn ends" style={{ fontSize: 6, color: T.textDim, marginTop: 1, fontFamily: FONT_UI, letterSpacing: 1 }}>
          {jp ? "このターン" : "THIS TURN"} {f(lo)}…{f(hi)}</div>;
      })()}
    </div>
  );
}

export function VirtualCardGrid({ cards, renderCard, cardWidth = 103, rowHeight = 120, gap = 6, containerStyle = {} }) {
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

  const cols = Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
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
          <div key={vRow.key} style={{ position: "absolute", top: vRow.start, left: 0, right: 0, display: "flex", gap }}>
            {rows[vRow.index].map(card => renderCard(card))}
          </div>
        ))}
      </div>
    </div>
  );
}
