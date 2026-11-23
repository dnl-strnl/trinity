import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { FONT_TITLE, FONT_UI, THEME as T, TYPE_COLORS as TC, STAT_DEFS, B } from "../theme.js";
import { aura, cPwr, getEff, turnRange, JP_STATS, JP_TYPES } from "../gameUtils.js";
import { Card, CDisp } from "../components.jsx";

export default function DuelBoard({
  game, setGame, curR, isMyTurn, jp, locale, t,
  mode, selB, tapTgt, aiR, logRef, showPit, setShowPit,
  selH, selectHand, boardClick, isH, isWrapH, clr,
  drawCard, endTurn, forfeit, playBC, resolveTap,
  doSetTrap, doSetEquip, doSetField, doSetBeing,
  log, setLog, setActionLog, pit, recentPit, eqFlash, inspCell, setInspCell,
  boardRef, cinemaRef, cinemaMode, cinemaSwap,
  C_MAX, TURN_CAP, actionsPerTurn, BEING_SET_ENABLED, TRIBUTE_SUMMON_ENABLED,
  aiCue, noAnim,
}) {
  // Board motion — every board change is compared with the board before it: a card that changed cell slides,
  // a new card lands, a card turned face-up flips, a card that left fades out. Works for either side's actions.
  const prevBd = useRef(null), motionN = useRef(0), lastN = useRef({});
  const [motion, setMotion] = useState({ cells: {}, ghosts: [] });
  useLayoutEffect(() => {
    const prev = prevBd.current; prevBd.current = game.bd;
    if (!prev || prev === game.bd || noAnim) return;
    const id = cl => cl ? `${cl.cd.id}|${cl.ow}` : null;
    const view = curR === "ai" ? -1 : 1; // the "ai" seat sees the board turned around
    const n = ++motionN.current, cells = {}, came = [], left = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const p = prev[r][c], q = game.bd[r][c];
      if (id(p) === id(q)) { if (p && p.fd && !q.fd) cells[`${r}-${c}`] = { kind: "flip", n }; continue; }
      if (q) came.push([r, c, q]);
      if (p) left.push([r, c, p]);
    }
    for (const [r, c, q] of came) {
      const i = left.findIndex(([, , p]) => id(p) === id(q) && !p.fd === !q.fd);
      if (i >= 0) { const [pr, pc] = left.splice(i, 1)[0]; cells[`${r}-${c}`] = { kind: "slide", n, dx: (pc - c) * view, dy: (pr - r) * view }; }
      else cells[`${r}-${c}`] = { kind: q.fd ? "set" : "land", n };
    }
    if (!Object.keys(cells).length && !left.length) return;
    Object.keys(cells).forEach(k => { lastN.current[k] = n; });
    setMotion(m => ({ cells: { ...m.cells, ...cells }, ghosts: [...m.ghosts, ...left.map(([r, c, cell]) => ({ r, c, cell, n }))] }));
    setTimeout(() => setMotion(m => ({
      cells: Object.fromEntries(Object.entries(m.cells).filter(([, v]) => v.n > n)), ghosts: m.ghosts.filter(gh => gh.n > n),
    })), 700);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.bd]);
  const MOTION = {
    land: "cardLand 440ms cubic-bezier(.2,.8,.3,1)", set: "cardSet 320ms ease-out",
    slide: "cardSlide 400ms cubic-bezier(.3,.7,.2,1)", flip: "cardFlip 440ms ease-out",
  };

  // Turn banner — a band across the board when the turn changes hands
  const [banner, setBanner] = useState(null); const lastTurn = useRef(game.turn);
  useEffect(() => {
    if (game.ph !== "playing") { setBanner(null); return; }
    if (game.turn === lastTurn.current) return;
    lastTurn.current = game.turn;
    if (noAnim) return;
    setBanner({ mine: game.turn === curR, n: game.tn });
    const tm = setTimeout(() => setBanner(null), 1500);
    return () => clearTimeout(tm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.turn, game.ph]);

  // Announcements on a cell are told apart by colour alone; only one with no cell of its own (a spell, a draw) is spelled out
  const cueCode = {
    MOVE: "#8f80dc", SUMMON: "#c9a8f0", TRIBUTE: "#c9a8f0", SET: "#7fdfe6",
    EQUIP: "#8fe0a8", FIELD: "#e6cf7a", TRIGGER: "#f08fa0", REVEAL: "#f0b27a", CAST: "#8fb8ff",
  }[aiCue?.label];
  const cueCol = aiCue?.hostile ? T.curse : cueCode || T.silverBright;
  return (
          <div style={{ display: "grid", gridTemplateColumns: cinemaMode ? (cinemaSwap ? "280px 1fr" : "1fr 280px") : (cinemaSwap ? "240px 1fr" : "1fr 240px"), gap: 16, height: "100%", animation: "fadeIn .3s", overflow: "hidden", position: "relative" }}>
            {/* Cinema ref anchor */}
            {cinemaMode && (
              <div ref={cinemaRef} style={{ display: "none" }} />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, minWidth: 0, overflow: "hidden", order: cinemaSwap ? 2 : 1 }}>
              {/* BOARD — cards fill cells */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div ref={boardRef} style={{
                  display: "grid", gridTemplateColumns: "repeat(5,1fr)", gridTemplateRows: "repeat(5,1fr)", gap: 5, padding: 5,
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
                    const isEqFlash = eqFlash && eqFlash.r === r && eqFlash.c === c;
                    const eqFlashAnim = isEqFlash
                      ? (eqFlash.aura > 0 ? "eqFlashGold" : eqFlash.aura < 0 ? "eqFlashRed" : "eqFlashWhite") + " 800ms ease-out forwards"
                      : "";

                    const mk = `${r}-${c}`, mo = motion.cells[mk];
                    // The AI's announced action: the cell it acts from is outlined, the cell it acts on pulses and is labelled
                    const cue = aiCue?.cells.filter(x => x.r === r && x.c === c).pop();
                    // An attack is announced on the cards themselves (attacker's strip a faint white, target's solid white), not by the label
                    const atkBanner = cue && aiCue.hostile && cell ? (cue.role === "to" ? "def" : "atk") : undefined;
                    const cueTag = cue && cue === aiCue.cells[aiCue.cells.length - 1] && !atkBanner && !cueCode;

                    return (
                      <div key={`${vr}-${vc}`} onClick={() => boardClick(vr, vc)} style={{
                        background: h ? T.gridCellHL : sel ? T.silver + "14" : T.gridCell,
                        border: cue ? `1px ${cue.role === "to" ? "solid" : "dashed"} ${cueCol}` : `1px solid ${h ? T.silver + "55" : sel ? T.silver : T.panelBorder}`,
                        borderRadius: 2, cursor: h || cell?.ow === mr ? "pointer" : "default",
                        display: "flex", alignItems: "stretch", justifyContent: "stretch",
                        transition: "all .1s", animation: eqFlashAnim || (cue?.role === "to" ? "cuePulse .7s ease-in-out infinite" : h ? "glow 1.5s ease-in-out infinite" : cell?.fd ? "trapGlow 2s ease-in-out infinite" : "none"),
                        "--cue": cueCol + "66",
                        backgroundImage: !cell ? `linear-gradient(135deg,${zone},transparent)` : "none",
                        // a card in flight is allowed out of its cell
                        overflow: mo && mo.kind !== "flip" ? "visible" : "hidden", zIndex: mo ? 6 : "auto",
                        position: "relative", padding: 1, height: "100%", width: "100%",
                      }}>
                        {motion.ghosts.filter(gh => gh.r === r && gh.c === c).map(gh => (
                          <div key={gh.n} style={{ position: "absolute", inset: 1, display: "flex", pointerEvents: "none", animation: "cardGhost 520ms ease-in forwards" }}>
                            <Card card={gh.cell.cd} fill owner={gh.cell.ow} fDown={gh.cell.fd} noRar viewerRole={mr} locale={locale} />
                          </div>))}
                        {cell && <div key={lastN.current[mk] || 0} style={{
                          display: "flex", width: "100%", height: "100%", minWidth: 0, minHeight: 0, position: "relative",
                          animation: mo ? MOTION[mo.kind] : "none", "--dx": mo?.dx || 0, "--dy": mo?.dy || 0,
                        }}>
                          <Card card={cell.cd} fill owner={cell.ow} sel={sel} fDown={cell.fd} noRar viewerRole={mr} locale={locale} banner={atkBanner}
                            effStats={cell.cd.type === "being" && !cell.fd ? getEff(cell.cd, game.bd, r, c, cell.ib) : null} />
                        </div>}
                        {h && isWrapH?.(r, c) && <div style={{
                          position: "absolute", top: 0, left: 0, right: 0, zIndex: 7, pointerEvents: "none", textAlign: "center", padding: "1px 0",
                          background: T.silverBright, color: "#000", fontFamily: FONT_UI, fontSize: 8, fontWeight: 900, letterSpacing: 2,
                        }}>↻ {t("ACROSS")}</div>}
                        {cueTag && <div style={{
                          position: "absolute", top: 0, left: 0, right: 0, zIndex: 7, pointerEvents: "none", textAlign: "center", padding: "1px 0",
                          background: cueCol, color: "#000", fontFamily: FONT_UI, fontSize: 8, fontWeight: 900, letterSpacing: 2,
                        }}>{t(aiCue.label)}</div>}
                      </div>);
                  }))}
                  {/* Single 3×3 contour rect per terrain card */}
                  {(() => {
                    const VB = 500, pad = 4, gap = 4, cs = (VB - 2 * pad - 4 * gap) / 5;
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
                  {/* An announced attack grabs its ground: two lines leave the attacker's back edge, run the grid lines
                      either way round attacker and target, and close on the target's far side */}
                  {(() => {
                    if (!aiCue?.hostile) return null;
                    const from = aiCue.cells.find(x => x.role === "from"), to = aiCue.cells.filter(x => x.role === "to").pop();
                    if (!from || !to) return null;
                    const VB = 500, pad = 4, gap = 4, cs = (VB - 2 * pad - 4 * gap) / 5;
                    const v = n => curR === "ai" ? 4 - n : n, at0 = n => pad + n * (cs + gap);
                    const fr = v(from.r), fc = v(from.c), tr = v(to.r), tc = v(to.c);
                    const x = at0(Math.min(fc, tc)) - gap / 2, y = at0(Math.min(fr, tr)) - gap / 2;
                    const w = (Math.abs(fc - tc) + 1) * (cs + gap), h = (Math.abs(fr - tr) + 1) * (cs + gap), P = 2 * (w + h);
                    // distance round the rectangle, clockwise from its top-left corner
                    const at = d => {
                      d = ((d % P) + P) % P;
                      return d <= w ? [x + d, y] : d <= w + h ? [x + w, y + d - w] : d <= 2 * w + h ? [x + 2 * w + h - d, y + h] : [x, y + P - d];
                    };
                    // the point on the attacker's edge that faces away from the target
                    const dx = Math.sign(tc - fc), dy = Math.sign(tr - fr);
                    const sx = dx > 0 ? x : dx < 0 ? x + w : at0(fc) + cs / 2, sy = dy > 0 ? y : dy < 0 ? y + h : at0(fr) + cs / 2;
                    const s0 = sy === y ? sx - x : sx === x + w ? w + sy - y : sy === y + h ? w + h + x + w - sx : P - (sy - y);
                    const walk = (d0, d1) => [at(d0), ...[-1, 0, 1].flatMap(n => [0, w, w + h, 2 * w + h].map(cd => cd + n * P)).filter(cd => cd > d0 && cd < d1).map(at), at(d1)];
                    const d = pts => "M" + pts.map(pt => pt.map(n => n.toFixed(1)).join(",")).join("L");
                    const arms = [walk(s0, s0 + P / 2), walk(s0 - P / 2, s0).reverse()];
                    return (
                      <svg key={`${from.r}${from.c}${to.r}${to.c}`} viewBox={`0 0 ${VB} ${VB}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 7, overflow: "visible", opacity: 0.75, filter: "drop-shadow(0 0 3px #fff)" }}>
                        {arms.map((pts, i) => <path key={i} d={d(pts)} pathLength={1} fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="square"
                          strokeDasharray={1} style={{ animation: noAnim ? "none" : "grabLine 320ms ease-out both" }} />)}
                      </svg>
                    );
                  })()}
                  {/* An announced AI action with no cell of its own (a spell, a draw) */}
                  {aiCue && !aiCue.cells.length && (
                    <div style={{
                      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 8, pointerEvents: "none",
                      padding: "5px 14px", background: "#04040aee", border: `1px solid ${cueCol}`, borderRadius: 2, animation: "fadeIn .2s",
                      color: cueCol, fontFamily: FONT_UI, fontSize: 11, fontWeight: 900, letterSpacing: 3,
                    }}>{t("Opp")} · {t(aiCue.label)}</div>)}
                  {banner && (
                    <div key={banner.n} style={{
                      position: "absolute", left: 0, right: 0, top: "50%", zIndex: 20, pointerEvents: "none", padding: "14px 0", textAlign: "center",
                      background: "linear-gradient(90deg,transparent,#04040af0 18%,#04040af0 82%,transparent)",
                      borderTop: `1px solid ${banner.mine ? T.silverBright : T.curse}55`, borderBottom: `1px solid ${banner.mine ? T.silverBright : T.curse}55`,
                      animation: "turnBanner 1.5s ease-out forwards",
                    }}>
                      <div style={{
                        fontFamily: FONT_UI, fontWeight: 900, fontSize: 20, letterSpacing: 7, textTransform: "uppercase",
                        color: banner.mine ? T.silverBright : T.curse, animation: "turnBannerText 1.5s ease-out forwards",
                      }}>{t(banner.mine ? "Your Turn" : "Opponent's Turn")}</div>
                    </div>)}
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
                  {game.ph === "over" ? t(game.win === curR ? "✦ VICTORY" : "▽ DEFEAT") : game.turn === curR ? t("Your Turn") : aiR && !jp
                    ? <>Opponent{[0, 1, 2].map(i => <span key={i} style={{ animation: `thinkDot 1.2s ${i * 0.2}s infinite` }}>.</span>)}</>
                    : t("Opponent...")}</div>
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
                  <CDisp value={game.c} label={jp ? (game.c === 0 ? "余剰" : game.c > 0 ? "上昇" : "堕落") : (game.c === 0 ? "EXCESS" : game.c > 0 ? "ASCENSION" : "CORRUPTION")} cMax={C_MAX} range={turnRange(game, TURN_CAP)} locale={locale} />
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
                  {mode === "summon" && selH !== null && BEING_SET_ENABLED && !(TRIBUTE_SUMMON_ENABLED && Math.abs(aura(game[curR === "player" ? "pH" : "aH"][selH])) > 5) && (
                    <button onClick={doSetBeing} style={B(T.silverDim)}>▼ {jp ? "伏せ（無料）" : "Set (FREE)"}</button>)}
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
  );
}
