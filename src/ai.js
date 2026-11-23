import { STAT_DEFS } from "./theme.js";
import {
  aura, adj, adjFull, attackCells, isTranscendent, isVoid, cPwr, getEff,
  canReach, hasAdjOccupied, hasAdjSetOrField, countAdjFaceUpFields,
  resolveCombat, viewFor, blindOdds, blindStat, SET_THREAT, clampC,
} from "./gameUtils.js";

// ─── AI Planner — pure helpers (no React side-effects) ──────────────────────
// cfg = { C_MAX, BEING_SET_ENABLED, TRIBUTE_SUMMON_ENABLED, PRESENCE_ENABLED, KOTH_ENABLED, COMBAT_CAP, TURN_CAP, ATTACKS_PER_BEING, EDGE_WRAP }
// aiPlan plans on viewFor(state, "ai"): the player's hand, the order of both decks and the
// player's face-down cards are blanked before any of the code below looks at the state.

export function aiClone(s) {
  return { ...s, bd: s.bd.map(row => row.map(c => c ? { ...c, ib: { ...(c.ib||{}) } } : null)), aH: [...s.aH], pH: [...s.pH], aD: [...s.aD], pD: [...s.pD] };
}
export function aiApplyC(s, amt, cfg) {
  s.c = clampC(s, s.c + amt, cfg.C_MAX, cfg.TURN_CAP);
  if (s.c >= cfg.C_MAX) { s.ph = "over"; s.win = s.pRole === "light" ? "player" : "ai"; }
  else if (s.c <= -cfg.C_MAX) { s.ph = "over"; s.win = s.pRole === "dark" ? "player" : "ai"; }
}
export function aiActions(s, cfg) {
  if (s.act <= 0 || s.ph !== "playing") return [];
  const aiPos = s.pRole === "dark", acts = [];
  for (let i = 0; i < s.aH.length; i++) {
    const c = s.aH[i]; if (c.type !== "bless" && c.type !== "curse") continue;
    const spellCost = (s.c === 0 && s.cMoved) ? 0 : 1;
    if (s.act < spellCost) continue;
    const v = c.type === "bless" ? cPwr(c) : -cPwr(c);
    const nC = clampC(s, s.c + v, cfg.C_MAX, cfg.TURN_CAP);
    acts.push({ type: "PLAY_SPELL", handIdx: i, card: c, isLethal: (aiPos && nC >= cfg.C_MAX) || (!aiPos && nC <= -cfg.C_MAX), cVal: v, cost: spellCost, reveals: cPwr(c) === 1 });
  }
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = s.bd[r][c]; if (!cl || cl.ow !== "ai" || cl.cd.type !== "being" || cl.fd) continue;
    if (cfg.ATTACKS_PER_BEING > 0 && (cl.atk || 0) >= cfg.ATTACKS_PER_BEING) continue;
    const aS = getEff(cl.cd, s.bd, r, c, cl.ib);
    for (const [tr, tc] of attackCells(r, c, aura(aS) === 0, cfg.EDGE_WRAP)) {
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
      if (tgt && tgt.ow === "ai" && !(tgt.cd?.type === "field" && !tgt.fd)) continue;
      if (tgt && !tgt.fd && !(clIsZero && tgt.cd?.type === "field") && !(tgt.cd?.type === "field" && tgt.ow === "ai")) continue;
      if (cl.summonedThisTurn && nr <= r) continue;
      // A step onto the player's face-down card is made blind. It may turn out to be a fight,
      // so the mover must be free to attack and commits to its own strongest stat.
      if (tgt?.fd && tgt.ow === "player") {
        if (cfg.BEING_SET_ENABLED && cfg.ATTACKS_PER_BEING > 0 && (cl.atk || 0) >= cfg.ATTACKS_PER_BEING) continue;
        acts.push({ type: "MOVE", fromRow: r, fromCol: c, toRow: nr, toCol: nc, cl, blind: true, reveals: true, stat: blindStat(getEff(cl.cd, s.bd, nr, nc, cl.ib)) });
        continue;
      }
      acts.push({ type: "MOVE", fromRow: r, fromCol: c, toRow: nr, toCol: nc, cl, isDiffuseTerrain: clIsZero && !!tgt && !tgt.fd && tgt.cd?.type === "field" });
    }
  }
  for (let hi = 0; hi < s.aH.length; hi++) {
    const card = s.aH[hi];
    if (card.type === "being") {
      if (cfg.TRIBUTE_SUMMON_ENABLED && Math.abs(aura(card)) > 5) {
        for (let tr = 0; tr < 5; tr++) for (let tc = 0; tc < 5; tc++) {
          const trib = s.bd[tr][tc]; if (!trib || trib.ow !== "ai" || trib.cd.type !== "being" || trib.fd) continue;
          for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++)
            if (!s.bd[r][c] || (r === tr && c === tc)) acts.push({ type: "TRIBUTE_SUMMON", handIdx: hi, card, row: r, col: c, tribRow: tr, tribCol: tc });
        }
      } else {
        for (let r = 0; r <= 1; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c, placeFit: (4 - (Math.abs(r - 2) + Math.abs(c - 2))) * 2 });
        // Field overlap: any unoccupied cell adjacent to 2+ face-up fields (outside normal summon zone)
        for (let r = 2; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c] && countAdjFaceUpFields(r, c, s.bd) >= 2) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c });
        if (isTranscendent(card)) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const cl = s.bd[r][c]; if (cl && (cl.cd?.type === "field" || cl.fd)) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c, isPurge: true }); } }
        // Void being: free placement anywhere empty
        if (isVoid(card)) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c]) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c }); }
        // Beacon: empty cells in 8-dir around friendly void beings on board
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const cl = s.bd[r][c]; if (cl?.ow === "ai" && cl.cd.type === "being" && !cl.fd && isVoid(cl.cd)) { for (const [ar, ac] of adjFull(r, c)) if (!s.bd[ar][ac]) acts.push({ type: "SUMMON", handIdx: hi, card, row: ar, col: ac }); } }
        // Being set: set face-down (~30% chance to consider)
        if (cfg.BEING_SET_ENABLED && Math.random() < 0.3) {
          for (let r = 0; r <= 2; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c] && !hasAdjOccupied(r, c, s.bd)) acts.push({ type: "SET_BEING", handIdx: hi, card, row: r, col: c });
        }
      }
    }
    else if (card.type === "field") {
      // TERRAIN (face-down): rows 0-4, tag with intent
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        if (s.bd[r][c] || hasAdjSetOrField(r, c, s.bd)) continue;
        const intent = r <= 2 ? "buff" : "trap";
        acts.push({ type: "TERRAIN", handIdx: hi, card, row: r, col: c, intent });
      }
      // PLAY_FIELD (face-up): empty cells near AI beings for immediate buff
      if (s.act >= 1) {
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
          if (s.bd[r][c] || hasAdjSetOrField(r, c, s.bd)) continue;
          let nearAiBeing = false;
          for (const [ar, ac] of adjFull(r, c)) { const nb = s.bd[ar]?.[ac]; if (nb?.ow === "ai" && nb.cd.type === "being" && !nb.fd) { nearAiBeing = true; break; } }
          if (nearAiBeing) acts.push({ type: "PLAY_FIELD", handIdx: hi, card, row: r, col: c });
        }
      }
    }
    else if (card.type === "equip") {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const cl = s.bd[r][c]; if (!cl || cl.ow !== "ai" || cl.cd.type !== "being" || cl.fd) continue;
        let eqFit = 0;
        const eff = getEff(cl.cd, s.bd, r, c, cl.ib);
        // Covers a zero-stat vulnerability
        for (const st of STAT_DEFS) if (eff[st.key] === 0 && (card[st.key] || 0) !== 0) eqFit += 25;
        // Being is adjacent to enemies
        for (const [ar, ac] of adj(r, c, 1)) { const nb = s.bd[ar]?.[ac]; if (nb?.ow === "player" && nb.cd.type === "being" && !nb.fd) { eqFit += 20; break; } }
        // Would create transcendence
        const postEff = {}; STAT_DEFS.forEach(st => { postEff[st.key] = eff[st.key] + (card[st.key] || 0); });
        if (aura(postEff) === 0 && aura(eff) !== 0) eqFit += 15;
        acts.push({ type: "EQUIP", handIdx: hi, item: card, row: r, col: c, eqFit });
      }
      if (s.act === 1 && Math.random() < 0.35) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c] && !hasAdjOccupied(r, c, s.bd)) acts.push({ type: "SET_EQUIP", handIdx: hi, card, row: r, col: c, bluff: true }); }
    }
    else if ((card.type === "bless" || card.type === "curse")) { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!s.bd[r][c] && !hasAdjOccupied(r, c, s.bd)) acts.push({ type: "SET_TRAP", handIdx: hi, card, row: r, col: c, bluff: Math.random() < 0.3 }); }
  }
  // FLIP actions — AI can flip its own primed set cards (max 2/turn, free)
  if ((s.flips || 0) < 2) {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cl = s.bd[r][c]; if (!cl || cl.ow !== "ai" || !cl.fd || (cl.prm || 0) > 0) continue;
      if (cl.cd.type === "field") {
        let buffCount = 0;
        for (const [ar, ac] of adjFull(r, c)) { const nb = s.bd[ar]?.[ac]; if (nb?.ow === "ai" && nb.cd.type === "being" && !nb.fd) buffCount++; }
        acts.push({ type: "FLIP_FIELD", row: r, col: c, buffCount, cost: 0 });
      } else if (cl.cd.type === "bless" || cl.cd.type === "curse") {
        const pwr = cPwr(cl.cd); const v = cl.cd.type === "bless" ? pwr : -pwr;
        const nC = clampC(s, s.c + v, cfg.C_MAX, cfg.TURN_CAP);
        const lethal = (aiPos && nC >= cfg.C_MAX) || (!aiPos && nC <= -cfg.C_MAX);
        acts.push({ type: "FLIP_TRAP", row: r, col: c, cVal: v, isLethal: lethal, cost: 0 });
      } else if (cl.cd.type === "being") {
        acts.push({ type: "FLIP_BEING", row: r, col: c, cost: 0 });
      }
    }
  }
  if (s.aD.length) acts.push({ type: "DRAW", reveals: true });
  return acts;
}
// What a blind step could lead to: [chance, resulting state] for each thing the card might be
function aiBlindOutcomes(s, a, cfg) {
  const aiDir = s.pRole === "dark" ? 1 : -1, lim = cfg.C_MAX - 1;
  return blindOdds(cfg.BEING_SET_ENABLED).map(([w, lives, cleared, cGain]) => {
    const s2 = aiClone(s), mover = s2.bd[a.fromRow][a.fromCol];
    s2.bd[a.fromRow][a.fromCol] = null; s2.act--;
    if (cleared) s2.bd[a.toRow][a.toCol] = null;
    if (lives) s2.bd[a.toRow][a.toCol] = mover;
    // A guess never ends the game
    s2.c = Math.max(-lim, Math.min(lim, s2.c + cGain * aiDir));
    return [w, s2];
  });
}
export function aiApply(s, a, cfg) {
  const pd = s.pRole === "light" ? 1 : -1;
  const capped = d => cfg.COMBAT_CAP > 0 ? Math.min(d, cfg.COMBAT_CAP) : d;
  if (a.type === "PLAY_SPELL") { s.aH.splice(a.handIdx, 1); const v = a.card.type === "bless" ? cPwr(a.card) : -cPwr(a.card); aiApplyC(s, v, cfg); s.act -= (a.cost ?? 1); if (cPwr(a.card) === 1 && s.aD.length) s.aH.push(s.aD.shift()); }
  else if (a.type === "ATTACK") { const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, res } = a; if (res.winner === "attacker") { s.bd[tr][tc] = null; s.bd[fr][fc].atk = (s.bd[fr][fc].atk || 0) + 1; aiApplyC(s, capped(res.dmg) * (-pd), cfg); } else if (res.winner === "defender") { s.bd[fr][fc] = null; aiApplyC(s, capped(res.dmg) * pd, cfg); } else { s.bd[fr][fc] = null; s.bd[tr][tc] = null; /* tie: both destroyed */ } s.act--; }
  else if (a.type === "MOVE") { const t = s.bd[a.toRow][a.toCol]; const mover = s.bd[a.fromRow][a.fromCol]; s.bd[a.fromRow][a.fromCol] = null; if (t?.cd?.type === "field" && !t.fd && t.ow === "ai") { s.bd[a.toRow][a.toCol] = mover; /* own field cleared */ } else { if (t?.ow === "player") s.bd[a.toRow][a.toCol] = null; s.bd[a.toRow][a.toCol] = mover; } s.act--; }
  else if (a.type === "SUMMON") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true }; s.act--; }
  else if (a.type === "TRIBUTE_SUMMON") { s.aH.splice(a.handIdx, 1); s.bd[a.tribRow][a.tribCol] = null; s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 }, summonedThisTurn: true }; s.act--; }
  else if (a.type === "TERRAIN") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } }; } // free action
  else if (a.type === "EQUIP") { const item = s.aH.splice(a.handIdx, 1)[0]; const cl = s.bd[a.row][a.col]; if (cl) { cl.ib = { ...cl.ib }; STAT_DEFS.forEach(st => { cl.ib[st.key] = (cl.ib[st.key] || 0) + (item[st.key] || 0); }); } s.act--; }
  else if (a.type === "SET_TRAP") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: true, prm: 1 }; s.act--; }
  else if (a.type === "SET_EQUIP") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: true, prm: 1 }; s.act = 0; }
  else if (a.type === "SET_BEING") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } }; } // free action
  else if (a.type === "FLIP_FIELD") { s.bd[a.row][a.col] = { ...s.bd[a.row][a.col], fd: false }; s.flips = (s.flips || 0) + 1; } // free
  else if (a.type === "FLIP_TRAP") { const cl = s.bd[a.row][a.col]; const pwr = cPwr(cl.cd); const v = cl.cd.type === "bless" ? pwr : -pwr; aiApplyC(s, v, cfg); s.bd[a.row][a.col] = null; s.flips = (s.flips || 0) + 1; } // free
  else if (a.type === "FLIP_BEING") { s.bd[a.row][a.col] = { ...s.bd[a.row][a.col], fd: false }; s.flips = (s.flips || 0) + 1; } // free
  else if (a.type === "PLAY_FIELD") { s.aH.splice(a.handIdx, 1); s.bd[a.row][a.col] = { cd: a.card, ow: "ai", fd: false, ib: { soul: 0, mind: 0, will: 0 } }; s.act--; }
  else if (a.type === "DRAW") { if (s.aD.length) { s.aH.push(s.aD.shift()); s.act--; } }
}
export function aiPhase(s) { return s.tn <= 4 ? "early" : s.tn <= 10 ? "mid" : "late"; }
export function aiScore(s, cfg) {
  if (s.ph === "over") return s.win === "ai" ? 1e6 : -1e6;
  const aiPos = s.pRole === "dark";
  const phase = aiPhase(s);
  const cWeight = phase === "late" ? 55 : phase === "mid" ? 40 : 30;
  let sc = (aiPos ? s.c : -s.c) * cWeight;

  // Collect board census (center-weighted for presence)
  let aiB = 0, pB = 0, aiBW = 0, pBW = 0;
  const aiBeings = [], pBeings = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = s.bd[r][c]; if (!cl) continue;
    if (cl.cd.type === "being" && !cl.fd) {
      const cw = (r >= 1 && r <= 3 && c >= 1 && c <= 3) ? 2 : 1;
      if (cl.ow === "ai") { aiB++; aiBW += cw; aiBeings.push({ r, c, cl }); }
      else { pB++; pBW += cw; pBeings.push({ r, c, cl }); }
    }
  }

  // Threat map: how many AI beings threaten each player being
  const pThreatCount = new Map(); // "r,c" -> count of AI beings that can kill it
  for (const pb of pBeings) pThreatCount.set(`${pb.r},${pb.c}`, 0);

  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = s.bd[r][c]; if (!cl) continue;
    if (cl.ow === "ai") {
      if (cl.cd.type === "being" && !cl.fd) {
        sc += 55 + (4 - (Math.abs(r - 2) + Math.abs(c - 2))) * 7 + r * 5;
        sc += STAT_DEFS.reduce((sum, st) => sum + Math.abs(cl.ib?.[st.key] || 0), 0) * 4;
        // Spread bonus
        let minD = 99;
        for (const ob of aiBeings) { if (ob.r === r && ob.c === c) continue; const d = Math.abs(r - ob.r) + Math.abs(c - ob.c); if (d < minD) minD = d; }
        if (minD === 1) sc -= 10; else if (minD === 2) sc += 4;

        const aS = getEff(cl.cd, s.bd, r, c, cl.ib);
        const clIsZero = aura(aS) === 0;

        // Per-being stat vulnerability penalty
        for (const st of STAT_DEFS) if (aS[st.key] === 0) sc -= 8;

        // Adjacent combat analysis
        let threats = 0, kills = 0, noWinAdj = 0;
        for (const [tr, tc] of attackCells(r, c, clIsZero, cfg.EDGE_WRAP)) {
          const tg = s.bd[tr]?.[tc]; if (!tg || tg.ow !== "player" || tg.cd.type !== "being" || tg.fd) continue;
          const dS = getEff(tg.cd, s.bd, tr, tc, tg.ib);
          const canWin = STAT_DEFS.some(st => resolveCombat(aS, dS, st.key).winner === "attacker");
          const canLose = STAT_DEFS.some(st => resolveCombat(aS, dS, st.key).winner === "defender");
          if (canWin) { kills++; const key = `${tr},${tc}`; if (pThreatCount.has(key)) pThreatCount.set(key, pThreatCount.get(key) + 1); }
          if (canLose) threats++;
          if (!canWin && canLose) noWinAdj++;
          sc += canWin ? 18 : -10;
        }
        // Retreat need: adjacent to enemies with no winning matchup
        if (noWinAdj > 0) sc -= noWinAdj * 12;
        // Edge/corner safety for threatened beings
        if (threats > 0 && (r === 0 || r === 4 || c === 0 || c === 4)) sc += 5;

        // Zero-aura: proximity to opponent terrain
        if (clIsZero) {
          for (let r2 = 0; r2 < 5; r2++) for (let c2 = 0; c2 < 5; c2++) {
            const t2 = s.bd[r2][c2]; if (!t2 || t2.ow !== "player" || t2.cd?.type !== "field") continue;
            const dist = Math.abs(r - r2) + Math.abs(c - c2);
            sc += dist === 0 ? 60 : dist === 1 ? 35 : dist === 2 ? 15 : 0;
          }
        }
        // c=0 vulnerability
        if (s.c === 0) {
          for (const [nr, nc] of adj(r, c, 1)) {
            const opp = s.bd[nr]?.[nc]; if (!opp || opp.ow !== "player" || opp.cd.type !== "being" || opp.fd) continue;
            const opS = getEff(opp.cd, s.bd, nr, nc, opp.ib);
            if (STAT_DEFS.some(st => Math.abs(aS[st.key]) < Math.abs(opS[st.key]))) { sc -= 60; break; }
          }
        }
      }
      // Face-down card value
      if (cl.fd) sc += r >= 2 ? 12 : 5;
      // Face-up field terrain-being synergy
      if (cl.cd.type === "field" && !cl.fd) {
        let aiBuffed = 0, pBuffed = 0;
        for (const [ar, ac] of adjFull(r, c)) {
          const nb = s.bd[ar]?.[ac]; if (!nb || nb.cd.type !== "being" || nb.fd) continue;
          if (nb.ow === "ai") aiBuffed++; else pBuffed++;
        }
        sc += aiBuffed * 12 - pBuffed * 8;
      } else if (cl.cd.type === "field" && cl.fd) {
        sc += r >= 3 ? 16 : 7;
      }
    } else {
      // The player's face-down card: unknown, so a standing threat
      if (cl.fd) sc -= cWeight * SET_THREAT;
      if (cl.cd.type === "being" && !cl.fd) {
        sc -= 28;
        for (const [tr, tc] of attackCells(r, c, aura(getEff(cl.cd, s.bd, r, c, cl.ib)) === 0, cfg.EDGE_WRAP)) {
          const al = s.bd[tr]?.[tc]; if (al && al.ow === "ai" && al.cd.type === "being" && !al.fd) sc -= 10;
        }
      }
    }
  }

  // Pincer bonus: 2+ AI beings threatening the same player being
  for (const [, cnt] of pThreatCount) if (cnt >= 2) sc += cnt * 8;

  // Consciousness strategy: spell-lethal detection
  const aiSpells = s.aH.filter(c => aiPos ? c.type === "bless" : c.type === "curse");
  const cToWinAI = aiPos ? cfg.C_MAX - s.c : s.c + cfg.C_MAX;
  if (aiSpells.length > 0) {
    const spellPwr = aiSpells.map(c => cPwr(c)).sort((a, b) => b - a);
    let acc = 0;
    for (let i = 0; i < Math.min(spellPwr.length, 3); i++) acc += spellPwr[i];
    if (acc >= cToWinAI && cToWinAI > 0) sc += 120; // spell-lethal available
    // Nexus proximity bonus: free casts when c=0
    if (s.c === 0 && s.cMoved && aiSpells.length > 0) sc += 30;
  }

  sc += (s.aH.length - s.pH.length) * 2 + s.aD.length * 0.5;

  // Penalty for beings in hand — phase-aware
  const handBeings = s.aH.filter(c => c.type === "being").length;
  sc -= handBeings * (phase === "early" ? 18 : 12);

  // Late game: boost spell play priority (reflected via hand spell value)
  if (phase === "late") sc += aiSpells.length * 8;

  // Presence bonus (center-weighted to match chkPresence)
  if (cfg.PRESENCE_ENABLED && s.tn > 3) {
    const bDiff = aiBW - pBW;
    if (Math.abs(bDiff) >= 2) sc += bDiff * 20;
    // Near-presence: 1 weighted point short of advantage
    if (bDiff === 1) sc += 10;
  }

  // Center square [2,2] control — yields +1C each turn (King of the Hill)
  if (cfg.KOTH_ENABLED && s.tn > 2) {
    const ctr = s.bd[2][2];
    if (ctr && !ctr.fd) {
      sc += ctr.ow === "ai" ? 45 : -45;
    } else if (!ctr) {
      // Empty center: bonus for having beings that can reach it
      for (const ab of aiBeings) {
        const dist = Math.abs(ab.r - 2) + Math.abs(ab.c - 2);
        if (dist <= 1) sc += 15;
        else if (dist === 2) sc += 6;
      }
    }
  }

  return sc;
}
// Best action sequence for the AI's turn. A step marked `reveals` shows the AI something it
// could not know (a drawn card, a face-down card), so runAI plans again after it.
export function aiPlan(real, cfg) {
  const init = viewFor(real, "ai");
  const phase = aiPhase(init);
  const FREE_TYPES = new Set(["FLIP_FIELD", "FLIP_TRAP", "FLIP_BEING", "TERRAIN", "SET_BEING"]);
  let bestScore = aiScore(init, cfg), bestSeq = [];
  function search(s, seq) {
    const sc = aiScore(s, cfg); if (sc > bestScore) { bestScore = sc; bestSeq = [...seq]; }
    const paidCount = seq.filter(a => (a.cost ?? 1) > 0 && !FREE_TYPES.has(a.type)).length;
    if (paidCount >= 3 || (s.act <= 0 && (s.flips || 0) >= 2) || s.ph !== "playing" || seq.length >= 6) return;
    const acts = aiActions(s, cfg);
    const spellRank = phase === "late" ? 50 : 20;
    acts.sort((a, b) => {
      const rank = x =>
        x.isLethal ? 1000 :
        x.type === "ATTACK" && x.val > 0 ? 100 + x.val :
        x.type === "FLIP_TRAP" ? 80 + Math.abs(x.cVal || 0) * 5 :
        x.type === "FLIP_FIELD" ? 70 + (x.buffCount || 0) * 10 :
        x.type === "FLIP_BEING" ? 65 :
        x.type === "TRIBUTE_SUMMON" ? 60 :
        x.type === "PLAY_FIELD" ? 58 :
        x.type === "SUMMON" ? 55 + (x.placeFit || 0) :
        x.type === "EQUIP" ? 45 + (x.eqFit || 0) * 0.5 :
        x.type === "TERRAIN" && x.intent === "buff" ? 42 :
        x.type === "MOVE" ? (x.blind ? 41 : 40) :
        x.type === "TERRAIN" ? 35 :
        x.type === "SET_BEING" ? 25 :
        x.type === "PLAY_SPELL" ? spellRank :
        x.type === "SET_TRAP" ? (x.bluff ? 38 + Math.random() * 20 : 10) :
        x.type === "SET_EQUIP" ? (x.bluff ? 36 + Math.random() * 20 : 5) :
        2;
      return rank(b) - rank(a);
    });
    const seen = {}; let tot = 0;
    const lim = { ATTACK: 5, PLAY_SPELL: 3, MOVE: 6, SUMMON: 5, TRIBUTE_SUMMON: 3, EQUIP: 4, TERRAIN: 4, SET_TRAP: 3, SET_EQUIP: 2, SET_BEING: 3, FLIP_FIELD: 2, FLIP_TRAP: 2, FLIP_BEING: 2, PLAY_FIELD: 2, DRAW: 1 };
    for (const a of acts) {
      if (a.isLethal) { const s2 = aiClone(s); aiApply(s2, a, cfg); search(s2, [...seq, a]); continue; }
      seen[a.type] = (seen[a.type] || 0) + 1; if (seen[a.type] > (lim[a.type] || 3) || tot++ > 22) continue;
      if (a.blind) {
        // A gamble: worth the average over what the card could be, and it ends the plan
        const ev = aiBlindOutcomes(s, a, cfg).reduce((sum, [w, s2]) => sum + w * aiScore(s2, cfg), 0);
        if (ev > bestScore) { bestScore = ev; bestSeq = [...seq, a]; }
        continue;
      }
      const s2 = aiClone(s); aiApply(s2, a, cfg);
      const pruneThresh = FREE_TYPES.has(a.type) ? -80 : -150;
      if (seq.length > 0 && aiScore(s2, cfg) < bestScore + pruneThresh) continue;
      search(s2, [...seq, a]);
    }
  }
  search(aiClone(init), []);
  return bestSeq;
}
