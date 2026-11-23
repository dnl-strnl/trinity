import { STAT_DEFS } from "./theme.js";
import { aura, adj, adjFull, cPwr, resolveCombat, viewFor, blindOdds, blindStat, SET_THREAT, clampC } from "./gameUtils.js";
import { legalActions, apply, cloneState, seatDir, otherSeat, effAt, mayAttack, attackCells, mirrorState, mirrorAction } from "./rules.js";

// ─── Planner — the ai.js heuristics, seat-agnostic, on top of rules.js ──────
// Same scoring terms, move ordering and one-turn greedy search as ai.js, but
// it plans for whichever seat is to move and only ever takes actions that
// rules.js says are legal. Like ai.js it plans on viewFor(): it never sees the
// other hand, the order of either deck, or what an enemy face-down card is.

const HK = seat => seat === "player" ? "pH" : "aH";
const DK = seat => seat === "player" ? "pD" : "aD";
// Rows advanced from the seat's own back row (ai starts at row 0, player at row 4)
const fwd = (seat, r) => seat === "ai" ? r : 4 - r;
const isUpBeing = (cl, seat) => !!cl && cl.ow === seat && cl.cd.type === "being" && !cl.fd;

export function phaseOf(s) { return s.tn <= 4 ? "early" : s.tn <= 10 ? "mid" : "late"; }

export function score(s, me, cfg, setThreat = SET_THREAT) {
  const opp = otherSeat(me);
  if (s.ph === "over") return s.win === me ? 1e6 : -1e6;
  const myDir = seatDir(s, me), myC = s.c * myDir;
  const phase = phaseOf(s);
  const cWeight = phase === "late" ? 55 : phase === "mid" ? 40 : 30;
  let sc = myC * cWeight;
  const myH = s[HK(me)], oppH = s[HK(opp)];

  // Board census (centre-weighted for presence)
  let myBW = 0, oppBW = 0;
  const mine = [], theirs = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = s.bd[r][c]; if (!cl || cl.cd.type !== "being" || cl.fd) continue;
    const cw = (r >= 1 && r <= 3 && c >= 1 && c <= 3) ? 2 : 1;
    if (cl.ow === me) { myBW += cw; mine.push({ r, c }); } else { oppBW += cw; theirs.push({ r, c }); }
  }

  // Threat map: how many of my beings can kill each enemy being
  const threatCount = new Map();
  for (const t of theirs) threatCount.set(`${t.r},${t.c}`, 0);

  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = s.bd[r][c]; if (!cl) continue;
    if (cl.ow === me) {
      if (cl.cd.type === "being" && !cl.fd) {
        sc += 55 + (4 - (Math.abs(r - 2) + Math.abs(c - 2))) * 7 + fwd(me, r) * 5;
        sc += STAT_DEFS.reduce((sum, st) => sum + Math.abs(cl.ib?.[st.key] || 0), 0) * 4;
        // Spread bonus
        let minD = 99;
        for (const ob of mine) { if (ob.r === r && ob.c === c) continue; const d = Math.abs(r - ob.r) + Math.abs(c - ob.c); if (d < minD) minD = d; }
        if (minD === 1) sc -= 10; else if (minD === 2) sc += 4;

        const aS = effAt(cl.cd, cl.ib, s.bd, r, c, cfg);
        const isZero = aura(aS) === 0;
        // Per-being stat vulnerability penalty
        for (const st of STAT_DEFS) if (aS[st.key] === 0) sc -= 8;

        // Adjacent combat analysis
        let threats = 0, noWinAdj = 0;
        for (const [tr, tc] of attackCells(r, c, isZero, cfg)) {
          const tg = s.bd[tr][tc]; if (!isUpBeing(tg, opp)) continue;
          const dS = effAt(tg.cd, tg.ib, s.bd, tr, tc, cfg);
          const canWin = STAT_DEFS.some(st => resolveCombat(aS, dS, st.key).winner === "attacker");
          const canLose = STAT_DEFS.some(st => resolveCombat(aS, dS, st.key).winner === "defender");
          if (canWin) { const key = `${tr},${tc}`; threatCount.set(key, threatCount.get(key) + 1); }
          if (canLose) threats++;
          if (!canWin && canLose) noWinAdj++;
          sc += canWin ? 18 : -10;
        }
        // Retreat need: adjacent to enemies with no winning matchup
        sc -= noWinAdj * 12;
        // Edge/corner safety for threatened beings
        if (threats > 0 && (r === 0 || r === 4 || c === 0 || c === 4)) sc += 5;

        // Zero-aura: proximity to enemy fields it can remove
        if (isZero) for (let r2 = 0; r2 < 5; r2++) for (let c2 = 0; c2 < 5; c2++) {
          const t2 = s.bd[r2][c2]; if (!t2 || t2.ow !== opp || t2.cd.type !== "field") continue;
          const dist = Math.abs(r - r2) + Math.abs(c - c2);
          sc += dist === 0 ? 60 : dist === 1 ? 35 : dist === 2 ? 15 : 0;
        }
        // c=0 vulnerability
        if (s.c === 0) for (const [nr, nc] of adj(r, c, 1)) {
          const o = s.bd[nr][nc]; if (!isUpBeing(o, opp)) continue;
          const oS = effAt(o.cd, o.ib, s.bd, nr, nc, cfg);
          if (STAT_DEFS.some(st => Math.abs(aS[st.key]) < Math.abs(oS[st.key]))) { sc -= 60; break; }
        }
      }
      // Face-down card value
      if (cl.fd) sc += fwd(me, r) >= 2 ? 12 : 5;
      // Face-up field: synergy with adjacent beings
      if (cl.cd.type === "field" && !cl.fd) {
        let myBuffed = 0, oppBuffed = 0;
        for (const [ar, ac] of adjFull(r, c)) {
          const nb = s.bd[ar][ac]; if (!nb || nb.cd.type !== "being" || nb.fd) continue;
          if (nb.ow === me) myBuffed++; else oppBuffed++;
        }
        sc += myBuffed * 12 - oppBuffed * 8;
      } else if (cl.cd.type === "field" && cl.fd) {
        sc += fwd(me, r) >= 3 ? 16 : 7;
      }
    } else if (cl.fd) {
      // An enemy face-down card: unknown, so a standing threat
      sc -= cWeight * setThreat;
    } else if (cl.cd.type === "being" && !cl.fd) {
      sc -= 28;
      for (const [tr, tc] of attackCells(r, c, aura(effAt(cl.cd, cl.ib, s.bd, r, c, cfg)) === 0, cfg)) if (isUpBeing(s.bd[tr][tc], me)) sc -= 10;
    }
  }

  // Pincer bonus: 2+ of my beings threatening the same enemy being
  for (const [, cnt] of threatCount) if (cnt >= 2) sc += cnt * 8;

  // Spell-lethal detection (top three on-faction spells in hand)
  const top3 = (hand, type) => hand.filter(c => c.type === type).map(c => cPwr(c)).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const mySpellType = myDir > 0 ? "bless" : "curse";
  const mySpells = myH.filter(c => c.type === mySpellType).length;
  const toWinMe = cfg.C_MAX - myC;
  if (mySpells > 0) {
    if (toWinMe > 0 && top3(myH, mySpellType) >= toWinMe) sc += 120;
    // Nexus proximity bonus: free casts when c=0
    if (s.c === 0 && s.cMoved) sc += 30;
  }

  sc += (myH.length - oppH.length) * 2 + s[DK(me)].length * 0.5;
  // Penalty for beings stuck in hand — phase-aware
  sc -= myH.filter(c => c.type === "being").length * (phase === "early" ? 18 : 12);
  // Late game: value held on-faction spells
  if (phase === "late") sc += mySpells * 8;

  // Presence (centre-weighted to match the rule)
  if (cfg.PRESENCE_ENABLED && s.tn > 3) {
    const bDiff = myBW - oppBW;
    if (Math.abs(bDiff) >= 2) sc += bDiff * 20;
    if (bDiff === 1) sc += 10;
  }
  // King of the hill: the centre cell yields 1 C a turn
  if (cfg.KOTH_ENABLED && s.tn > 2) {
    const ctr = s.bd[2][2];
    if (ctr && !ctr.fd) sc += ctr.ow === me ? 45 : -45;
    else if (!ctr) for (const b of mine) {
      const dist = Math.abs(b.r - 2) + Math.abs(b.c - 2);
      if (dist <= 1) sc += 15; else if (dist === 2) sc += 6;
    }
  }
  return sc;
}

// Legal actions for the seat to move, annotated with what the move ordering needs.
// `flags` holds the once-per-turn coin flips ai.js used to make per search node.
function candidates(s, me, cfg, flags) {
  const opp = otherSeat(me), myDir = seatDir(s, me), acts = [], fights = new Map();
  const lethal = v => clampC(s, s.c + v, cfg.C_MAX, cfg.variant?.turnCap) * myDir >= cfg.C_MAX;
  for (const a of legalActions(s, cfg)) {
    switch (a.type) {
      case "PLAY_SPELL": a.cVal = a.card.type === "bless" ? cPwr(a.card) : -cPwr(a.card); a.isLethal = lethal(a.cVal); a.reveals = cPwr(a.card) === 1; break;
      case "DRAW": a.reveals = true; break;
      case "ATTACK": {
        // One candidate per attacker→target: the best of the three stats
        const atk = s.bd[a.fromRow][a.fromCol], def = s.bd[a.toRow][a.toCol];
        const res = resolveCombat(effAt(atk.cd, atk.ib, s.bd, a.fromRow, a.fromCol, cfg), effAt(def.cd, def.ib, s.bd, a.toRow, a.toCol, cfg), a.stat);
        a.val = res.winner === "attacker" ? res.dmg * 3 + 15 : res.winner === "tie" ? 0 : -res.dmg - 5;
        const key = `${a.type}${a.fromRow}${a.fromCol}${a.toRow}${a.toCol}`, prev = fights.get(key);
        if (!prev || a.val > prev.val) fights.set(key, a);
        continue;
      }
      case "MOVE": {
        // Never trample your own set trap or field
        const t = s.bd[a.toRow][a.toCol];
        if (t && t.ow === me && t.fd && t.cd.type !== "equip") continue;
        if (t && t.ow === opp && t.fd) {
          // A step onto a face-down enemy card is made blind. It may turn out to be a fight,
          // so the mover must be free to attack and commits to its own strongest stat.
          const cl = s.bd[a.fromRow][a.fromCol];
          if (cfg.BEING_SET_ENABLED && !mayAttack(cl, cfg)) continue;
          a.blind = a.reveals = true;
          a.stat = blindStat(effAt(cl.cd, cl.ib, s.bd, a.toRow, a.toCol, cfg));
        }
        break;
      }
      case "SUMMON": if (!a.isPurge && fwd(me, a.row) <= 1) a.placeFit = (4 - (Math.abs(a.row - 2) + Math.abs(a.col - 2))) * 2; break;
      case "SET_BEING": if (!flags.setBeing) continue; break;
      case "TERRAIN": a.intent = fwd(me, a.row) <= 2 ? "buff" : "trap"; break;
      case "PLAY_FIELD": if (!adjFull(a.row, a.col).some(([ar, ac]) => isUpBeing(s.bd[ar][ac], me))) continue; break;
      case "EQUIP": {
        const cl = s.bd[a.row][a.col]; if (cl.fd) continue;
        const eff = effAt(cl.cd, cl.ib, s.bd, a.row, a.col, cfg);
        let eqFit = 0;
        // Covers a zero-stat vulnerability
        for (const st of STAT_DEFS) if (eff[st.key] === 0 && (a.item[st.key] || 0) !== 0) eqFit += 25;
        // Being is adjacent to enemies
        if (adj(a.row, a.col, 1).some(([ar, ac]) => isUpBeing(s.bd[ar][ac], opp))) eqFit += 20;
        // Would create transcendence
        if (aura(eff) !== 0 && aura(eff) + aura(a.item) === 0) eqFit += 15;
        a.eqFit = eqFit;
        break;
      }
      case "SET_EQUIP": if (!flags.setEquip) continue; a.bluff = true; break;
      case "SET_TRAP": a.bluff = flags.bluff; break;
      case "FLIP_FIELD": a.buffCount = adjFull(a.row, a.col).filter(([ar, ac]) => isUpBeing(s.bd[ar][ac], me)).length; break;
      case "FLIP_TRAP": { const cd = s.bd[a.row][a.col].cd; a.cVal = cd.type === "bless" ? cPwr(cd) : -cPwr(cd); a.isLethal = lethal(a.cVal); break; }
      default: break;
    }
    acts.push(a);
  }
  for (const a of fights.values()) acts.push(a);
  return acts;
}

const LIMITS = { ATTACK: 5, PLAY_SPELL: 3, MOVE: 6, SUMMON: 5, TRIBUTE_SUMMON: 3, EQUIP: 4, TERRAIN: 4, SET_TRAP: 3, SET_EQUIP: 2, SET_BEING: 3, SET_BATTLE: 3, FLIP_FIELD: 2, FLIP_TRAP: 2, FLIP_BEING: 2, PLAY_FIELD: 2, DRAW: 1 };

// What a blind step could lead to: [chance, resulting state] for each thing the card might be
function blindOutcomes(s, a, me, cfg) {
  const dir = seatDir(s, me), lim = cfg.C_MAX - 1;
  return blindOdds(cfg.BEING_SET_ENABLED).map(([w, lives, cleared, cGain]) => {
    const s2 = cloneState(s), cl = s2.bd[a.fromRow][a.fromCol];
    s2.bd[a.fromRow][a.fromCol] = null; s2.act--;
    if (cleared) s2.bd[a.toRow][a.toCol] = null;
    if (lives) s2.bd[a.toRow][a.toCol] = cl;
    // A guess never ends the game
    s2.c = Math.max(-lim, Math.min(lim, s2.c + cGain * dir));
    return [w, s2];
  });
}

// What a planned step is once the rules look at the hidden card: onto a face-down being it is a blind battle
export function settle(s, a) {
  if (!a.blind) return a;
  const d = s.bd[a.toRow][a.toCol];
  return d && d.fd && d.cd.type === "being" ? { ...a, type: "SET_BATTLE" } : { ...a, stat: undefined };
}

// Best action sequence for the seat to move this turn. A step marked `reveals` shows the
// planner something it could not know (a drawn card, a face-down card), so whoever runs
// the plan should plan again after it. `rnd` supplies the
// planner's own coin flips (defaults to the game RNG so seeded runs repeat).
export function plan(init, cfg, rnd = cfg.rng, setThreat = SET_THREAT) {
  // Always search from the ai seat's frame so both seats break ties the same way
  if (init.turn === "player") return planFor(mirrorState(init), cfg, rnd, setThreat).map(mirrorAction);
  return planFor(init, cfg, rnd, setThreat);
}
function planFor(real, cfg, rnd, setThreat) {
  const me = real.turn, init = viewFor(real, me);
  const pcfg = { ...cfg, rng: () => 0.5 }; // look-ahead must not consume the game's RNG stream
  const flags = { setBeing: rnd() < 0.3, setEquip: rnd() < 0.35, bluff: rnd() < 0.3, trapJit: rnd() * 20, equipJit: rnd() * 20 };
  const phase = phaseOf(init), spellRank = phase === "late" ? 50 : 20;
  const maxLen = cfg.actionsPerTurn + 3, flipCap = cfg.variant?.flipsPerTurn ?? 2;
  const sco = s => score(s, me, cfg, setThreat);
  const rank = x =>
    x.isLethal ? 1000 :
    (x.type === "ATTACK" && x.val > 0) ? 100 + x.val :
    (x.type === "SET_BATTLE" && x.val > 0) ? 95 + x.val :
    x.type === "FLIP_TRAP" ? 80 + Math.abs(x.cVal || 0) * 5 :
    x.type === "FLIP_FIELD" ? 70 + (x.buffCount || 0) * 10 :
    x.type === "FLIP_BEING" ? 65 :
    x.type === "TRIBUTE_SUMMON" ? 60 :
    x.type === "PLAY_FIELD" ? 58 :
    x.type === "SUMMON" ? 55 + (x.placeFit || 0) :
    x.type === "EQUIP" ? 45 + (x.eqFit || 0) * 0.5 :
    (x.type === "TERRAIN" && x.intent === "buff") ? 42 :
    x.type === "MOVE" ? (x.blind ? 41 : 40) :
    x.type === "TERRAIN" ? 35 :
    x.type === "SET_BEING" ? 25 :
    x.type === "PLAY_SPELL" ? spellRank :
    x.type === "SET_TRAP" ? (x.bluff ? 38 + flags.trapJit : 10) :
    x.type === "SET_EQUIP" ? (x.bluff ? 36 + flags.equipJit : 5) :
    2;

  let bestScore = sco(init), bestSeq = [];
  function search(s, seq) {
    const sc = sco(s); if (sc > bestScore) { bestScore = sc; bestSeq = seq; }
    if (s.ph !== "playing" || seq.length >= maxLen) return;
    if (s.act <= 0 && (s.flips || 0) >= flipCap) return;
    let acts = candidates(s, me, pcfg, flags);
    if (s.act <= 0) acts = acts.filter(a => a.type.startsWith("FLIP"));
    for (const a of acts) a.rank = rank(a);
    acts.sort((a, b) => b.rank - a.rank);
    const seen = {}; let tot = 0;
    for (const a of acts) {
      if (!a.isLethal) { seen[a.type] = (seen[a.type] || 0) + 1; if (seen[a.type] > (LIMITS[a.type] || 3) || tot++ > 22) continue; }
      if (a.blind) {
        // A gamble: worth the average over what the card could be, and it ends the plan
        const ev = blindOutcomes(s, a, me, cfg).reduce((sum, [w, s2]) => sum + w * sco(s2), 0);
        if (ev > bestScore) { bestScore = ev; bestSeq = [...seq, a]; }
        continue;
      }
      const s2 = apply(cloneState(s), a, pcfg);
      if (!a.isLethal && seq.length > 0 && sco(s2) < bestScore + ((a.cost === 0) ? -80 : -150)) continue;
      search(s2, [...seq, a]);
    }
  }
  search(cloneState(init), []);
  return bestSeq;
}
