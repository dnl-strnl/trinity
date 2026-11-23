import {
  aura, adj, adjFull, cPwr, getEff, resolveCombat, flipSets, clampC,
} from "./gameUtils.js";
import {
  STAT_DEFS, THEME as T, TYPE_COLORS as TC, FONT_TITLE,
} from "./theme.js";
import { aiPlan as aiPlanFn } from "./ai.js";

// ── Pit helpers ─────────────────────────────────────────────────────────────

export function toPit(card, owner, fx) {
  fx.setPit(prev => ({ ...prev, [owner]: [...prev[owner], card] }));
  fx.setRecentPit(prev => [{ card, owner, t: Date.now() }, ...prev].slice(0, 3));
}

export function reshufflePit(g, role, fx) {
  const dk = role === "player" ? "pD" : "aD";
  if (g[dk].length > 0) return;
  const cards = fx.pit[role];
  if (!cards.length) return;
  const shuffled = [...cards].sort(() => Math.random() - 0.5);
  g[dk] = shuffled;
  fx.setPit(p => ({ ...p, [role]: [] }));
  fx.addLog(`↺ ${role === "player" ? "Your" : "Opp"} pit recycled (${shuffled.length} cards)`);
  fx.enqF("RECYCLE", { color: T.silverDim, border: T.silverBright, icon: "↺", sub: `${shuffled.length} cards` });
}

// ── Consciousness helpers────────────────────────────────────────────────────

export function combatC(g, dmg, winningStat, winnerOwner, battleOpts, atkCard, defCard, atkWon, logPrefix, statKey, fx) {
  const playerDir = g.pRole === "light" ? 1 : -1;
  // Optional cap on how far one combat can move C (0 = off)
  const want = (fx.COMBAT_CAP > 0 ? Math.min(dmg, fx.COMBAT_CAP) : dmg) * (winnerOwner === "player" ? playerDir : -playerDir);
  // What the meter will actually move (the turn cap may hold it back)
  const cShift = clampC(g, g.c + want, fx.C_MAX, fx.TURN_CAP) - g.c;

  const absShift = Math.abs(cShift);
  const label = cShift > 0 ? `+${absShift}C` : `−${absShift}C`;
  const color = cShift > 0 ? T.bless : T.curse;

  const prevC = g.c;
  const nextC = prevC + cShift;
  const crossedZero = (prevC > 0 && nextC < 0) || (prevC < 0 && nextC > 0) || (prevC !== 0 && nextC === 0);

  if (crossedZero) {
    fx.playSfx(cShift > 0 ? "revenance-pos" : "revenance-neg");
  } else if (statKey) {
    fx.playSfx(`battle-${statKey[0]}`);
  }

  fx.enqF(label, { color, border: color, icon: cShift > 0 ? "A" : "C", iconFont: FONT_TITLE, ...battleOpts, atkWon });
  applyC(g, want, fx, true); // true to skip internal revenance sound
  fx.addLog(`${logPrefix} (${label} Meter)`);
}

export function applyC(g, amt, fx, skipSfx) {
  const prev = g.c;
  const next = clampC(g, prev + amt, fx.C_MAX, fx.TURN_CAP);
  if (next !== Math.max(-fx.C_MAX, Math.min(fx.C_MAX, prev + amt))) fx.addLog(`⊣ Turn limit: C moves at most ${fx.TURN_CAP} in one turn`);
  g.c = next;
  if (!g.cMoved && next !== prev) g.cMoved = true;

  const crossedZero = (prev > 0 && next < 0) || (prev < 0 && next > 0) || (prev !== 0 && next === 0);
  if (crossedZero && !skipSfx) {
    fx.playSfx("revenance");
    if (amt < 0 && g.pD.length && g.pRole === "light") { g.pH.push(...g.pD.splice(0, Math.min(2, g.pD.length))); fx.addLog("⟐ AWAKENING"); }
    else if (amt > 0 && g.aD.length && g.pRole === "light") { g.aH.push(...g.aD.splice(0, Math.min(2, g.aD.length))); fx.addLog("⟐ REVENANCE"); }
    else if (amt > 0 && g.pD.length && g.pRole === "dark") { g.pH.push(...g.pD.splice(0, Math.min(2, g.pD.length))); fx.addLog("⟐ AWAKENING"); }
    else if (amt < 0 && g.aD.length && g.pRole === "dark") { g.aH.push(...g.aD.splice(0, Math.min(2, g.aD.length))); fx.addLog("⟐ REVENANCE"); }
    // Slow down the sequence slightly when these trigger
    if (fx.fB.current) fx.fB.current = true; // Wait for flash
  }

  // Victory Conditions
  const winLight = g.c >= fx.C_MAX;
  const winDark = g.c <= -fx.C_MAX;

  if (winLight) {
    g.ph = "over";
    if (g.pRole === "light") { g.win = "player"; fx.setTokens(t => t + fx.TOKENS_PER_WIN); fx.enqF("ENLIGHTENMENT", { color: "#e8e8f8", border: "#e8e8f8", icon: fx.jp ? "悟" : "E" }); }
    else { g.win = "ai"; fx.enqF("DEFEAT", { color: T.curse, border: T.curse }); }
    setTimeout(() => fx.saveGameLog(g), 0);
  } else if (winDark) {
    g.ph = "over";
    if (g.pRole === "dark") { g.win = "player"; fx.setTokens(t => t + fx.TOKENS_PER_WIN); fx.enqF("OBLIVION", { color: "#e8e8f8", border: "#e8e8f8", icon: fx.jp ? "虚" : "O" }); }
    else { g.win = "ai"; fx.enqF("DEFEAT", { color: T.curse, border: T.curse }); }
    setTimeout(() => fx.saveGameLog(g), 0);
  }
}

// ── Board check helpers ─────────────────────────────────────────────────────

export function chkTraps(g, r, c, mover, movingCell, isFieldTrans, fx) {
  const opp = mover === "player" ? "ai" : "player";
  adj(r, c).forEach(([ar, ac]) => {
    const cell = g.bd[ar]?.[ac];
    /* NOTE: Removed original Blessing/Curse proximity triggers to allow for
     "defusing" via moving over. Proximity triggers can be added back for
     specific "Ambush" entity types later if desired. */
  });

  const landCell = g.bd[r][c];
  if (!landCell) return false;

  // Face-down being — handled by set-battle flow in the caller
  if (landCell.fd && landCell.cd?.type === "being") return false;

  // Opponent's face-down field — entity destroyed, field activates face-up
  if (landCell.fd && landCell.cd?.type === "field" && landCell.ow === opp) {
    fx.playSfx("diffuse");
    fx.enqF("FIELD ACTIVATED", { color: TC.field, border: TC.field, icon: "F", image: landCell.cd.image });
    fx.addLog(`▣ Field Activated: ${landCell.cd.name || "Field"} — ${movingCell?.cd?.name || "Being"} destroyed`);
    if (movingCell) toPit(movingCell.cd, mover, fx);
    g.bd[r][c] = { ...landCell, fd: false }; // field flips face-up, stays on board
    return true; // entity was consumed
  }

  // Opponent's spell trap — defuse
  if (landCell.fd && landCell.ow === opp && (landCell.cd.type === "bless" || landCell.cd.type === "curse")) {
    fx.playSfx("diffuse");
    fx.enqF("TRAP DEFUSED", { color: T.textDim, border: T.silverDim, icon: "T" });
    fx.addLog(`⊘ Trap Defused: ${landCell.cd.name || "Trap"}`);
    toPit(landCell.cd, opp, fx);
    g.bd[r][c] = null;
    return false;
  }

  // Own set equip (primed) — apply to moving entity
  if (landCell.fd && landCell.cd?.type === "equip" && landCell.ow === mover && (landCell.prm || 0) <= 0) {
    if (movingCell) {
      movingCell.ib = { ...movingCell.ib };
      STAT_DEFS.forEach(s => { movingCell.ib[s.key] = (movingCell.ib[s.key] || 0) + (landCell.cd[s.key] || 0); });
    }
    fx.playSfx("equip");
    const eqA = aura(landCell.cd); fx.setEqFlash({ r, c, aura: eqA }); setTimeout(() => fx.setEqFlash(null), 900);
    fx.enqF("EQUIP ACTIVATED", { color: TC.equip, border: TC.equip, icon: "E", image: landCell.cd.image });
    fx.addLog(`⊕ Equip Activated: ${landCell.cd.name || "Equip"}`);
    toPit(landCell.cd, mover, fx);
    g.bd[r][c] = null;
    return false;
  }

  // Opponent's set equip — diffuse (no effect)
  if (landCell.fd && landCell.cd?.type === "equip" && landCell.ow === opp) {
    fx.playSfx("diffuse");
    fx.enqF("EQUIP DIFFUSED", { color: T.textDim, border: T.silverDim, icon: "E" });
    fx.addLog(`⊘ Equip Diffused: ${landCell.cd.name || "Equip"}`);
    toPit(landCell.cd, opp, fx);
    g.bd[r][c] = null;
    return false;
  }

  // Zero-aura entity landing on face-up terrain — diffuse it
  if (!landCell.fd && landCell.cd?.type === "field" && isFieldTrans) {
    fx.playSfx("diffuse");
    fx.enqF("FIELD DIFFUSED", { color: TC.field, border: TC.field, icon: "F" });
    fx.addLog(`✡ Field Diffused`);
    toPit(landCell.cd, landCell.ow, fx);
    g.bd[r][c] = null;
  }
  // Own face-up field — remove it to open a corridor
  else if (!landCell.fd && landCell.cd?.type === "field" && landCell.ow === mover) {
    fx.playSfx("diffuse");
    fx.enqF("FIELD CLEARED", { color: TC.field, border: TC.field, icon: "✕" });
    fx.addLog(`✕ Field Cleared: ${landCell.cd.name || "Field"}`);
    toPit(landCell.cd, mover, fx);
    g.bd[r][c] = null;
  }
  // Any other card under the mover (own set trap/field, a face-up field) is discarded, not overwritten
  else if (landCell.cd?.type !== "being") {
    toPit(landCell.cd, landCell.ow, fx);
    g.bd[r][c] = null;
  }
  return false;
}

export function checkFieldFreeings(g, fx) {
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
        fx.enqF("FIELD FREED", { color: TC.field, border: TC.field, icon: "F" });
        fx.addLog(`✕ Field Freed: ${cell.cd.name || "Field"}`);
        toPit(cell.cd, cell.ow, fx);
        g.bd[r][c] = null;
      }
    }
  }
}

export function chkPresence(g, fx) {
  if (!fx.PRESENCE_ENABLED || g.ph === "over" || g.tn <= 3) return;
  let pCount = 0, aCount = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = g.bd[r][c];
    if (cl?.cd.type === "being" && !cl.fd) {
      // Center 3x3 (rows 1-3, cols 1-3) beings count double for presence
      const centerBonus = (r >= 1 && r <= 3 && c >= 1 && c <= 3) ? 2 : 1;
      if (cl.ow === "player") pCount += centerBonus; else aCount += centerBonus;
    }
  }
  const diff = pCount - aCount;
  if (Math.abs(diff) < 2) return;
  const playerDir = g.pRole === "light" ? 1 : -1;
  const shift = Math.sign(diff) * playerDir;
  applyC(g, shift, fx, true);
  const label = shift > 0 ? `+${shift}C` : `${shift}C`;
  fx.playSfx("presence");
  fx.enqF("PRESENCE", { color: shift > 0 ? T.bless : T.curse, border: shift > 0 ? T.bless : T.curse, icon: shift > 0 ? "△" : "▽" });
  fx.addLog(`✧ Presence: ${label} (${pCount}v${aCount})`);
}

export function chkCenter(g, fx) {
  if (!fx.KOTH_ENABLED || g.ph === "over" || g.tn <= 2) return;
  const cl = g.bd[2][2];
  if (!cl || cl.fd) return;
  const playerDir = g.pRole === "light" ? 1 : -1;
  const shift = cl.ow === "player" ? playerDir : -playerDir;
  applyC(g, shift, fx, true);
  const label = shift > 0 ? `+${shift}C` : `${shift}C`;
  fx.playSfx("presence");
  fx.enqF("CENTER", { color: shift > 0 ? T.bless : T.curse, border: shift > 0 ? T.bless : T.curse, icon: "◈" });
  fx.addLog(`◈ Center: ${label} (${cl.cd.name || cl.cd.type})`);
}

// ── AI Execution ────────────────────────────────────────────────────────────

// What the board announces before each AI action. A label never names a card the player cannot see yet.
const AI_CUES = {
  PLAY_SPELL: "CAST", ATTACK: "ATTACK", SET_BATTLE: "ATTACK", MOVE: "MOVE", SUMMON: "SUMMON", TRIBUTE_SUMMON: "TRIBUTE",
  TERRAIN: "SET", SET_TRAP: "SET", SET_EQUIP: "SET", SET_BEING: "SET", EQUIP: "EQUIP",
  FLIP_FIELD: "FIELD", FLIP_TRAP: "TRIGGER", FLIP_BEING: "REVEAL", PLAY_FIELD: "FIELD", DRAW: "DRAW",
};
function aiCue(p) {
  const label = AI_CUES[p.type];
  if (!label) return null;
  const cells = [];
  if (p.fromRow != null) cells.push({ r: p.fromRow, c: p.fromCol, role: "from" });
  if (p.tribRow != null) cells.push({ r: p.tribRow, c: p.tribCol, role: "from" });
  if (p.toRow != null) cells.push({ r: p.toRow, c: p.toCol, role: "to" });
  if (p.row != null) cells.push({ r: p.row, c: p.col, role: "to" });
  return { label, cells, hostile: label === "ATTACK" };
}

// How long a summon's flash holds the stage before the card lands on the board (the card arrives as the flash fades)
export const placeDelay = (card, video) => video ? 2000 : card.image ? 1700 : 1000;

export function runAI(g, idx, fx, cued) {
  if (fx.forfeitRef.current) { fx.setAiR(false); return; }
  if (g.ph === "over") { fx.setAiR(false); return; }
  function endAITurn(s) {
    chkPresence(s, fx);
    chkCenter(s, fx);
    if (s.ph === "over") { fx.setGame({ ...s }); fx.setAiR(false); return; }
    s.turn = "player"; s.act = fx.actionsPerTurn; s.flips = 0; s.c0 = s.c; flipSets(s, "player"); s.tn++;
    if (!s.pD.length) reshufflePit(s, "player", fx);
    if (s.pD.length) { s.pH = [...s.pH]; s.pD = [...s.pD]; s.pH.push(s.pD.shift()); fx.playSfx("draw"); }
    fx.setGame({ ...s }); fx.setAiR(false);
  }
  const aiCfg = { C_MAX: fx.C_MAX, BEING_SET_ENABLED: fx.BEING_SET_ENABLED, TRIBUTE_SUMMON_ENABLED: fx.TRIBUTE_SUMMON_ENABLED, PRESENCE_ENABLED: fx.PRESENCE_ENABLED, KOTH_ENABLED: fx.KOTH_ENABLED, COMBAT_CAP: fx.COMBAT_CAP, TURN_CAP: fx.TURN_CAP, ATTACKS_PER_BEING: fx.ATTACKS_PER_BEING, EDGE_WRAP: fx.EDGE_WRAP };
  if (idx === 0 && !cued) fx.aiPlanRef.current = aiPlanFn(g, aiCfg);
  let planned = fx.aiPlanRef.current[idx];
  // The AI plans a step onto a face-down card without knowing what it is. If it is a being, that step is a blind battle.
  if (planned?.blind) {
    const hid = g.bd[planned.toRow]?.[planned.toCol];
    if (hid?.fd && hid.ow === "player" && hid.cd.type === "being" && fx.BEING_SET_ENABLED) planned = { ...planned, type: "SET_BATTLE" };
  }
  if (!planned || g.act <= 0 || idx >= 12) {
    endAITurn({ ...g, bd: g.bd.map(r => [...r]), aH: [...g.aH], aD: [...g.aD], pH: [...g.pH], pD: [...g.pD] }); return;
  }
  // Telegraph: the board shows where the action is about to happen, then the action runs
  const pace = fx.PACE || { beat: 0, mult: 1 };
  const cue = !cued && pace.beat > 0 ? aiCue(planned) : null;
  if (cue) {
    fx.setAiCue(cue); fx.playSfx("cue");
    setTimeout(() => { fx.setAiCue(null); runAI(g, idx, fx, true); }, pace.beat);
    return;
  }
  let s = { ...g, bd: g.bd.map(r => [...r]), aH: [...g.aH], aD: [...g.aD], pH: [...g.pH], pD: [...g.pD] };
  // After a step that showed the AI something it could not know (a drawn card, a face-down card),
  // the rest of the turn is planned again
  const next = () => {
    if (planned.reveals && s.ph !== "over") fx.aiPlanRef.current = [...fx.aiPlanRef.current.slice(0, idx + 1), ...aiPlanFn(s, aiCfg)];
    runAI(s, idx + 1, fx);
  };
  // Delay helper — waits for animation to finish + breathing room
  const delay = (ms) => setTimeout(next, ms * pace.mult);
  const hasVid = (card) => fx.videoFor(card);
  switch (planned.type) {
    case "PLAY_SPELL": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const sp = s.aH[hi];
      const v = sp.type === "bless" ? cPwr(sp) : -cPwr(sp);
      const spellCost = (s.c === 0 && s.cMoved) ? 0 : 1;
      s.aH.splice(hi, 1); s.act -= spellCost;
      if (sp.type === "bless") fx.enqF(`+${cPwr(sp)}C`, { color: T.bless, border: T.bless, icon: "△", image: sp.image, video: fx.videoFor(sp) });
      else fx.enqF(`−${cPwr(sp)}C`, { color: T.curse, border: T.curse, icon: "▽", image: sp.image, video: fx.videoFor(sp) });
      fx.playSfx(`spell-${sp.type}`); applyC(s, v, fx);
      if (cPwr(sp) === 1) { if (!s.aD.length) reshufflePit(s, "ai", fx); if (s.aD.length) { const d = s.aD.shift(); s.aH.push(d); fx.addLog(`Opp Draw (free)`); } }
      toPit(sp, "ai", fx); fx.addLog(`Opp ${sp.type}: ${sp.name || sp.type} (${v > 0 ? "+" : "−"}${cPwr(sp)}C)`);
      fx.setGame({ ...s }); delay(hasVid(sp) ? 3500 : sp.image ? 2600 : 1500); break;
    }
    case "ATTACK": {
      const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, stat } = planned;
      const atk = s.bd[fr]?.[fc]; const def = s.bd[tr]?.[tc];
      if (!atk || !def || atk.ow !== "ai" || atk.cd.type !== "being" || def.ow !== "player" || def.cd.type !== "being") { runAI(s, idx + 1, fx); return; }
      const aS = getEff(atk.cd, s.bd, fr, fc, atk.ib), dS = getEff(def.cd, s.bd, tr, tc, def.ib);
      const res = resolveCombat(aS, dS, stat);
      const aiBO = { atkCard: atk.cd, defCard: def.cd, sub: `Opp ${stat.toUpperCase()} |${Math.abs(aS[stat])}| vs |${Math.abs(dS[stat])}|` };
      s.act--;
      if (res.winner === "attacker") {
        s.bd[tr][tc] = null; toPit(def.cd, "player", fx);
        s.bd[fr][fc] = { ...atk, atk: (atk.atk || 0) + 1 };
        combatC(s, res.dmg, res.winningStat, "ai", aiBO, atk.cd, def.cd, true, `⚔ ${atk.cd.name || "Atk"} > ${def.cd.name || "Def"} [${stat.toUpperCase()}]`, stat, fx);
      } else if (res.winner === "defender") {
        s.bd[fr][fc] = null; toPit(atk.cd, "ai", fx);
        combatC(s, res.dmg, res.winningStat, "player", aiBO, atk.cd, def.cd, false, `⚔ ${atk.cd.name || "Atk"} < ${def.cd.name || "Def"} [${stat.toUpperCase()}]`, stat, fx);
      } else {
        // Tie — both destroyed, same as a player-initiated attack
        s.bd[fr][fc] = null; s.bd[tr][tc] = null;
        toPit(atk.cd, "ai", fx); toPit(def.cd, "player", fx);
        fx.playSfx(`battle-${stat[0]}`);
        fx.enqF("⚔", { color: T.textDim, border: T.textDim, ...aiBO, tie: true });
        fx.addLog(`⚔ ${atk.cd.name || "Atk"} = ${def.cd.name || "Def"} (tie) [${stat.toUpperCase()}]`);
      }
      fx.setGame({ ...s }); delay(3000); break;
    }
    case "MOVE": {
      const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc } = planned;
      const cl = s.bd[fr]?.[fc]; if (!cl) { endAITurn(s); return; }
      const clEffS = getEff(cl.cd, s.bd, fr, fc, cl.ib);
      const clIsFieldTrans = aura(clEffS) === 0;
      s.bd[fr][fc] = null;
      const aiConsumed = chkTraps(s, tr, tc, "ai", cl, clIsFieldTrans, fx);
      if (!aiConsumed) s.bd[tr][tc] = cl;
      checkFieldFreeings(s, fx);
      s.act--; fx.playSfx("move");
      fx.addLog(`Opp Move: ${cl.cd.name || "Being"}`); fx.setGame({ ...s }); delay(900); break;
    }
    case "SUMMON": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const card = s.aH[hi]; const { row: r, col: c } = planned;
      const existing = s.bd[r][c];
      const isPurge = existing && (existing.cd?.type === "field" || existing.fd);
      if (existing && !isPurge) { endAITurn(s); return; }
      if (isPurge) { s.bd[r][c] = null; toPit(existing.cd, existing.ow, fx); }
      s.aH.splice(hi, 1); s.act--;
      fx.playSfx("summon");
      const summonVid = !isPurge && hasVid(card);
      if (isPurge) {
        fx.enqF("PURGE", { color: TC.field, border: TC.field, icon: "✕", image: card.image });
        fx.addLog(`Opp Purge: ${existing.cd?.name || existing.cd?.type}`);
      } else {
        fx.enqF("SUMMON", { color: T.being, border: TC[card.type] || T.being, image: card.image, video: fx.videoFor(card) });
        fx.addLog(`Opp Summon: ${card.name || "Being"}`);
      }
      fx.setGame({ ...s });
      const placeDly = placeDelay(card, summonVid);
      setTimeout(() => {
        s.bd[r][c] = { cd: card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true };
        fx.setGame({ ...s }); setTimeout(() => runAI(s, idx + 1, fx), summonVid ? 1500 : 800);
      }, placeDly); break;
    }
    case "TRIBUTE_SUMMON": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const card = s.aH[hi]; const { row: r, col: c, tribRow: tr, tribCol: tc } = planned;
      const tribCell = s.bd[tr]?.[tc];
      if (!tribCell || tribCell.ow !== "ai") { endAITurn(s); return; }
      s.aH.splice(hi, 1);
      toPit(tribCell.cd, "ai", fx);
      s.bd[tr][tc] = null; s.act--;
      const tribVid = hasVid(card);
      fx.playSfx("summon");
      fx.enqF("TRIBUTE", { color: T.legendary, border: T.legendary, icon: "✦", image: card.image, video: fx.videoFor(card) });
      fx.addLog(`Opp Tribute: ${tribCell.cd?.name || "Being"} → ${card.name || "Being"}`);
      fx.setGame({ ...s });
      const placeDly = placeDelay(card, tribVid);
      setTimeout(() => {
        s.bd[r][c] = { cd: card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true };
        fx.setGame({ ...s }); setTimeout(() => runAI(s, idx + 1, fx), tribVid ? 1500 : 800);
      }, placeDly); break;
    }
    case "TERRAIN": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const card = s.aH[hi]; const { row: r, col: c } = planned;
      s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } };
      fx.playSfx("set");
      fx.addLog(`Opp Field: ${card.name || "Field"}`); fx.setGame({ ...s }); delay(900); break;
    }
    case "EQUIP": {
      const hi = s.aH.findIndex(c => c.id === planned.item.id);
      if (hi === -1) { endAITurn(s); return; }
      const item = s.aH.splice(hi, 1)[0]; const cl = s.bd[planned.row]?.[planned.col];
      if (!cl) { endAITurn(s); return; }
      cl.ib = { ...cl.ib }; STAT_DEFS.forEach(st => { cl.ib[st.key] = (cl.ib[st.key] || 0) + (item[st.key] || 0); });
      s.act--; fx.playSfx("equip"); fx.addLog(`Opp Equip: ${item.name || "Equip"}`);
      const eia = aura(item); fx.setEqFlash({ r: planned.row, c: planned.col, aura: eia }); setTimeout(() => fx.setEqFlash(null), 900);
      fx.setGame({ ...s }); delay(1000); break;
    }
    case "SET_TRAP": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const card = s.aH[hi]; const { row: r, col: c } = planned;
      if (s.bd[r][c]) { endAITurn(s); return; }
      s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: true, prm: 1 };
      fx.playSfx("set"); fx.enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "▼" });
      s.act--; fx.addLog(`Opp Set: Trap`); fx.setGame({ ...s }); delay(1500); break;
    }
    case "SET_EQUIP": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const card = s.aH[hi]; const { row: r, col: c } = planned;
      if (s.bd[r][c]) { endAITurn(s); return; }
      s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: true, prm: 1 };
      fx.playSfx("set"); fx.enqF("SET", { color: TC.equip, border: TC.equip, icon: "▼" });
      s.act = 0; fx.addLog(`Opp Set: Equip`); fx.setGame({ ...s }); delay(1500); break;
    }
    case "SET_BEING": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const card = s.aH[hi]; const { row: r, col: c } = planned;
      if (s.bd[r][c]) { endAITurn(s); return; }
      s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } };
      fx.playSfx("set"); fx.enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "▼" });
      fx.addLog(`Opp Set: Being`); fx.setGame({ ...s }); delay(1500); break;
    }
    case "SET_BATTLE": {
      const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, stat } = planned;
      const atk = s.bd[fr]?.[fc]; const def = s.bd[tr]?.[tc];
      if (!atk || !def || atk.ow !== "ai" || atk.cd.type !== "being" || def.ow !== "player" || !def.fd) { runAI(s, idx + 1, fx); return; }
      const statDef = STAT_DEFS.find(sd => sd.key === stat);

      // Phase 1: Show chosen stat + move attacker off source
      fx.playSfx("action");
      fx.enqF(stat.toUpperCase(), { color: statDef.color, border: statDef.color, icon: statDef.label, image: atk.cd.image });
      fx.addLog(`⚔ Opp ${atk.cd.name || "Atk"} chose ${stat.toUpperCase()}`);
      s.bd[fr][fc] = null;
      fx.setGame({ ...s });

      // Phase 2: Reveal set being
      setTimeout(() => {
        s.bd[tr][tc] = { ...def, fd: false };
        fx.enqF("REVEAL", { color: TC.being || T.being, border: TC.being || T.being, image: def.cd.image });
        fx.addLog(`▼ Revealed: ${def.cd.name || "Being"}`);
        fx.setGame({ ...s });

        // Phase 3: Resolve combat
        setTimeout(() => {
          const aS = getEff(atk.cd, s.bd, tr, tc, atk.ib);
          const dS = getEff(def.cd, s.bd, tr, tc, def.ib);
          const res = resolveCombat(aS, dS, stat);
          const aiBO = { atkCard: atk.cd, defCard: def.cd, sub: `Opp ${stat.toUpperCase()} |${Math.abs(aS[stat])}| vs |${Math.abs(dS[stat])}|` };
          if (res.winner === "attacker") {
            s.bd[tr][tc] = { ...atk, atk: (atk.atk || 0) + 1 }; toPit(def.cd, "player", fx);
            combatC(s, res.dmg, res.winningStat, "ai", aiBO, atk.cd, def.cd, true, `⚔ ${atk.cd.name || "Atk"} > ${def.cd.name || "Def"} [${stat.toUpperCase()}]`, stat, fx);
          } else if (res.winner === "defender") {
            s.bd[tr][tc] = { ...def, fd: false }; toPit(atk.cd, "ai", fx);
            combatC(s, res.dmg, res.winningStat, "player", aiBO, atk.cd, def.cd, false, `⚔ ${atk.cd.name || "Atk"} < ${def.cd.name || "Def"} [${stat.toUpperCase()}]`, stat, fx);
          } else {
            s.bd[tr][tc] = null; toPit(atk.cd, "ai", fx); toPit(def.cd, "player", fx);
            fx.playSfx(`battle-${stat[0]}`);
            fx.enqF("⚔", { color: T.textDim, border: T.textDim, ...aiBO, tie: true });
            fx.addLog(`⚔ ${atk.cd.name || "Atk"} = ${def.cd.name || "Def"} (tie) [${stat.toUpperCase()}]`);
          }
          s.act--;
          checkFieldFreeings(s, fx);
          fx.logAction?.(planned, s);
          fx.setGame({ ...s }); setTimeout(next, 3000);
        }, 2000);
      }, 2000);
      break;
    }
    case "FLIP_FIELD": {
      const { row: r, col: c } = planned; const cl = s.bd[r]?.[c];
      if (!cl || cl.ow !== "ai" || !cl.fd || cl.cd.type !== "field") { runAI(s, idx + 1, fx); return; }
      s.bd[r][c] = { ...cl, fd: false }; s.flips = (s.flips || 0) + 1;
      fx.playSfx("flip"); fx.enqF("FIELD", { color: TC.field, border: TC.field, icon: "▣", image: cl.cd.image, video: fx.videoFor(cl.cd) });
      fx.addLog(`Opp Field: ${cl.cd.name || "Field"} activated`); fx.setGame({ ...s }); delay(cl.cd.image ? 2200 : 1500); break;
    }
    case "FLIP_TRAP": {
      const { row: r, col: c } = planned; const cl = s.bd[r]?.[c];
      if (!cl || cl.ow !== "ai" || !cl.fd || (cl.cd.type !== "bless" && cl.cd.type !== "curse")) { runAI(s, idx + 1, fx); return; }
      const pwr = cPwr(cl.cd); const v = cl.cd.type === "bless" ? pwr : -pwr;
      s.bd[r][c] = null; s.flips = (s.flips || 0) + 1;
      if (cl.cd.type === "bless") { fx.enqF(`+${pwr}C`, { color: T.bless, border: T.bless, icon: "△", image: cl.cd.image, video: fx.videoFor(cl.cd) }); }
      else { fx.enqF(`−${pwr}C`, { color: T.curse, border: T.curse, icon: "▽", image: cl.cd.image, video: fx.videoFor(cl.cd) }); }
      fx.playSfx(`spell-${cl.cd.type}`); applyC(s, v, fx); toPit(cl.cd, "ai", fx);
      fx.addLog(`Opp Trigger: ${cl.cd.name || cl.cd.type} (${v > 0 ? "+" : ""}${v}C)`); fx.setGame({ ...s }); delay(hasVid(cl.cd) ? 3500 : cl.cd.image ? 2600 : 1500); break;
    }
    case "FLIP_BEING": {
      const { row: r, col: c } = planned; const cl = s.bd[r]?.[c];
      if (!cl || cl.ow !== "ai" || !cl.fd || cl.cd.type !== "being") { runAI(s, idx + 1, fx); return; }
      s.bd[r][c] = { ...cl, fd: false }; s.flips = (s.flips || 0) + 1;
      fx.playSfx("flip"); fx.enqF("REVEAL", { color: TC.being || T.being, border: TC.being || T.being, image: cl.cd.image, video: fx.videoFor(cl.cd) });
      fx.addLog(`Opp Reveal: ${cl.cd.name || "Being"}`); fx.setGame({ ...s }); delay(hasVid(cl.cd) ? 3500 : cl.cd.image ? 2600 : 1500); break;
    }
    case "PLAY_FIELD": {
      const hi = s.aH.findIndex(c => c.id === planned.card.id);
      if (hi === -1) { endAITurn(s); return; }
      const card = s.aH[hi]; const { row: r, col: c } = planned;
      if (s.bd[r][c]) { endAITurn(s); return; }
      s.aH.splice(hi, 1); s.bd[r][c] = { cd: card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 } }; s.act--;
      fx.playSfx("field"); fx.enqF("FIELD", { color: TC.field, border: TC.field, icon: "▣", image: card.image, video: fx.videoFor(card) });
      fx.addLog(`Opp Field: ${card.name || "Field"}`); fx.setGame({ ...s }); delay(hasVid(card) ? 3500 : card.image ? 2600 : 1500); break;
    }
    case "DRAW": {
      if (s.aD.length) { s.aH.push(s.aD.shift()); s.act--; }
      fx.playSfx("draw");
      fx.addLog(`Opp Draw`); fx.setGame({ ...s }); delay(800); break;
    }
    default:
      endAITurn(s); return;
  }
  // Audit trail entry with C as it stands after the action (a set battle logs itself once resolved)
  if (planned.type !== "SET_BATTLE") fx.logAction?.(planned, s);
}
