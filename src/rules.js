import { STAT_DEFS } from "./theme.js";
import {
  aura, adj, adjFull, attackCells as attackCellsOn, isWrapAttack, isTranscendent, isVoid, isSpell, canReach, hasAdjOccupied,
  hasAdjSetOrField, countAdjFaceUpFields, getEff, cPwr, resolveCombat, clampC,
} from "./gameUtils.js";

// ─── Rules — one pure, seat-agnostic rulebook ───────────────────────────────
// Transcribed from the human action handlers in Trinity.jsx, which are the
// canonical rules. No React, no fx bag: state in, state out.
//
// cfg = { C_MAX, HAND_SIZE, actionsPerTurn, BEING_SET_ENABLED, TRIBUTE_SUMMON_ENABLED,
//         PRESENCE_ENABLED, KOTH_ENABLED, rng, variant }
// state = { bd, pH, aH, pD, aD, pit: { player, ai }, c, cMoved, turn, act, tn, ph, win, pRole, flips }
// Actions use the planner vocabulary (PLAY_SPELL, ATTACK, MOVE, SUMMON, ...).

// Experimental rule switches. Every default is the game as played today, so a
// balance experiment is a one-key override rather than a code change.
export const DEFAULT_VARIANT = {
  attacksPerBeing: null,    // null = unlimited; 1 = one attack per being per turn
  summonSick: false,        // true = a being can't attack the turn it is summoned
  movedCantAttack: false,   // true = a being that moved this turn can't attack
  combatCap: null,          // max C a single combat can move (null = uncapped)
  turnCap: null,            // max C the meter can move away from where it stood when the turn began (null = uncapped; live setting turnCap)
  statCap: null,            // clamp on each effective |stat| (null = uncapped)
  equipsPerBeing: null,     // max equips a being can carry (null = unlimited)
  flipsPerTurn: 2,
  firstTurnActions: null,   // actions on the very first turn (null = actionsPerTurn)
  zeroCrossDraw: "spells",  // "spells" = only spells/trap flips trigger the 2-card draw; "all" = any crossing
  trapSetCost: 0,
  tributeBy: "aura",        // "aura" = |aura| > 5; "total" = |S|+|M|+|W| >= 8
  kothBeingsOnly: false,    // true = a field on the centre cell doesn't score
  sideBySpells: false,      // true = light/dark from spells alone, being auras ignored
  mulligan: false,          // true = one free redraw of a hand with fewer than 2 playable beings
  wrapAttack: null,         // zero-aura beings attack across board edges: "full" or "straight" (live setting edgeWrap; see gameUtils attackCells)
};

export function rulesCfg(cfg) {
  return { ...cfg, variant: { ...DEFAULT_VARIANT, ...(cfg.variant || {}) } };
}
const vr = cfg => cfg.variant || DEFAULT_VARIANT;

export const otherSeat = seat => seat === "player" ? "ai" : "player";
const HK = seat => seat === "player" ? "pH" : "aH";
const DK = seat => seat === "player" ? "pD" : "aD";
// +1 if the seat wins at +C_MAX (light), -1 if it wins at -C_MAX (dark)
export const seatDir = (s, seat) => (s.pRole === "light") === (seat === "player") ? 1 : -1;
const zeroIb = () => ({ soul: 0, mind: 0, will: 0 });

export function shuffleWith(a, rng) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function cloneState(s) {
  return {
    ...s,
    bd: s.bd.map(row => row.map(c => c ? { ...c, ib: c.ib ? { ...c.ib } : c.ib } : null)),
    pH: [...s.pH], aH: [...s.aH], pD: [...s.pD], aD: [...s.aD],
    pit: { player: [...s.pit.player], ai: [...s.pit.ai] },
  };
}

// The same position seen from the other seat: seats swapped, rows flipped, sides kept.
// Rules and planner must treat a state and its mirror identically — tests rely on it.
export function mirrorState(s) {
  const sw = seat => seat === "player" ? "ai" : seat === "ai" ? "player" : seat;
  return {
    ...s,
    bd: [4, 3, 2, 1, 0].map(r => s.bd[r].map(c => c ? { ...c, ow: sw(c.ow), ib: c.ib ? { ...c.ib } : c.ib } : null)),
    pH: [...s.aH], aH: [...s.pH], pD: [...s.aD], aD: [...s.pD],
    pit: { player: [...s.pit.ai], ai: [...s.pit.player] },
    turn: sw(s.turn), win: sw(s.win), pRole: s.pRole === "light" ? "dark" : "light",
  };
}
export function mirrorAction(a) {
  const m = { ...a };
  for (const k of ["row", "fromRow", "toRow", "tribRow"]) if (m[k] != null) m[k] = 4 - m[k];
  return m;
}

// Effective stats of a card standing at (r, c): base + adjacent face-up fields + equips
export function effAt(cd, ib, bd, r, c, cfg) {
  const e = getEff(cd, bd, r, c, ib);
  const cap = vr(cfg).statCap;
  if (cap != null) for (const st of STAT_DEFS) e[st.key] = Math.max(-cap, Math.min(cap, e[st.key]));
  return e;
}

export function needsTribute(card, cfg) {
  if (!cfg.TRIBUTE_SUMMON_ENABLED) return false;
  return vr(cfg).tributeBy === "total" ? cPwr(card) >= 8 : Math.abs(aura(card)) > 5;
}

// Light or dark for a deck of card objects (the player seat's deck decides the game's sides)
export function deckSide(cards, cfg) {
  const spells = cards.reduce((sum, c) => sum + (c.type === "bless" ? cPwr(c) : c.type === "curse" ? -cPwr(c) : 0), 0);
  const auras = cards.reduce((sum, c) => sum + (isSpell(c) ? 0 : aura(c)), 0);
  const mag = vr(cfg).sideBySpells ? (spells || auras) : spells + auras;
  return mag < 0 ? "dark" : "light";
}

export function newGame(pCards, aCards, cfg) {
  const v = vr(cfg);
  const deal = cards => {
    let d = shuffleWith(cards, cfg.rng);
    if (v.mulligan && d.slice(0, cfg.HAND_SIZE).filter(c => c.type === "being" && !needsTribute(c, cfg)).length < 2) d = shuffleWith(cards, cfg.rng);
    return d;
  };
  const pD = deal(pCards), aD = deal(aCards);
  return {
    bd: Array.from({ length: 5 }, () => Array(5).fill(null)),
    pH: pD.splice(0, cfg.HAND_SIZE), aH: aD.splice(0, cfg.HAND_SIZE), pD, aD,
    pit: { player: [], ai: [] },
    c: 0, c0: 0, cMoved: false, turn: cfg.rng() < 0.5 ? "player" : "ai",
    act: v.firstTurnActions ?? cfg.actionsPerTurn, tn: 1, ph: "playing", win: null,
    pRole: deckSide(pCards, cfg), flips: 0,
  };
}

// ─── Legal actions for the seat whose turn it is ────────────────────────────

function summonCells(s, seat, card) {
  const bd = s.bd, cells = [], seen = new Set();
  const add = (r, c, purge) => { const k = r * 5 + c; if (seen.has(k)) return; seen.add(k); cells.push([r, c, purge]); };
  for (const r of seat === "player" ? [3, 4] : [0, 1]) for (let c = 0; c < 5; c++) if (!bd[r][c]) add(r, c, false);
  // Field overlap: any empty cell adjacent to 2+ face-up fields
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!bd[r][c] && countAdjFaceUpFields(r, c, bd) >= 2) add(r, c, false);
  // Aura-zero being: purge any field or face-down card by summoning onto it
  if (isTranscendent(card)) for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = bd[r][c]; if (cl && (cl.cd.type === "field" || cl.fd)) add(r, c, true);
  }
  // Void being (0/0/0): any empty cell
  if (isVoid(card)) for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!bd[r][c]) add(r, c, false);
  // Beacon: empty cells around a friendly face-up void being
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = bd[r][c];
    if (cl?.ow === seat && cl.cd.type === "being" && !cl.fd && isVoid(cl.cd)) for (const [ar, ac] of adjFull(r, c)) if (!bd[ar][ac]) add(ar, ac, false);
  }
  return cells;
}

function setBeingCells(s, seat, card) {
  const bd = s.bd, cells = [], seen = new Set();
  const add = (r, c) => { const k = r * 5 + c; if (seen.has(k) || bd[r][c] || hasAdjOccupied(r, c, bd)) return; seen.add(k); cells.push([r, c]); };
  // Own two rows plus the middle row
  for (const r of seat === "player" ? [2, 3, 4] : [0, 1, 2]) for (let c = 0; c < 5; c++) add(r, c);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (countAdjFaceUpFields(r, c, bd) >= 2) add(r, c);
  if (isVoid(card)) for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) add(r, c);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = bd[r][c];
    if (cl?.ow === seat && cl.cd.type === "being" && !cl.fd && isVoid(cl.cd)) for (const [ar, ac] of adjFull(r, c)) add(ar, ac);
  }
  return cells;
}

// Cells a being at (r, c) can attack (see gameUtils attackCells); the wrapAttack variant is the live edgeWrap setting
export const attackCells = (r, c, isZero, cfg) => attackCellsOn(r, c, isZero, vr(cfg).wrapAttack);

export const mayAttack = (cl, cfg) => canAttack(cl, vr(cfg));
function canAttack(cl, v) {
  if (v.attacksPerBeing != null && (cl.atk || 0) >= v.attacksPerBeing) return false;
  if (v.summonSick && cl.summonedThisTurn) return false;
  if (v.movedCantAttack && cl.moved) return false;
  return true;
}

export function legalActions(s, cfg) {
  if (s.ph !== "playing") return [];
  const me = s.turn, opp = otherSeat(me), v = vr(cfg), bd = s.bd, hand = s[HK(me)], act = s.act, acts = [];

  // Empty cells open to a set card (no orthogonal neighbour) or a face-up field (no field/set card around)
  const openSet = [], openField = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    if (bd[r][c]) continue;
    if (!hasAdjOccupied(r, c, bd)) openSet.push([r, c]);
    if (!hasAdjSetOrField(r, c, bd)) openField.push([r, c]);
  }

  for (let hi = 0; hi < hand.length; hi++) {
    const card = hand[hi];
    if (card.type === "being") {
      if (act < 1) continue;
      if (needsTribute(card, cfg)) {
        // Sacrifice one of your face-up beings; the new being lands on any empty cell or the vacated one
        for (let tr = 0; tr < 5; tr++) for (let tc = 0; tc < 5; tc++) {
          const trib = bd[tr][tc]; if (!trib || trib.ow !== me || trib.cd.type !== "being" || trib.fd) continue;
          for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++)
            if (!bd[r][c] || (r === tr && c === tc)) acts.push({ type: "TRIBUTE_SUMMON", handIdx: hi, card, row: r, col: c, tribRow: tr, tribCol: tc });
        }
      } else {
        for (const [r, c, purge] of summonCells(s, me, card)) acts.push({ type: "SUMMON", handIdx: hi, card, row: r, col: c, isPurge: purge });
        if (cfg.BEING_SET_ENABLED) for (const [r, c] of setBeingCells(s, me, card)) acts.push({ type: "SET_BEING", handIdx: hi, card, row: r, col: c, cost: 0 });
      }
    } else if (isSpell(card)) {
      if (act < 1) continue;
      // Nexus: a spell is free at exactly 0 once C has moved
      acts.push({ type: "PLAY_SPELL", handIdx: hi, card, cost: s.c === 0 && s.cMoved ? 0 : 1 });
      if (act >= v.trapSetCost) for (const [r, c] of openSet) acts.push({ type: "SET_TRAP", handIdx: hi, card, row: r, col: c, cost: v.trapSetCost });
    } else if (card.type === "field") {
      if (act >= 1) for (const [r, c] of openField) acts.push({ type: "PLAY_FIELD", handIdx: hi, card, row: r, col: c });
      for (const [r, c] of openSet) acts.push({ type: "TERRAIN", handIdx: hi, card, row: r, col: c, cost: 0 });
    } else if (card.type === "equip") {
      if (act < 1) continue;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const cl = bd[r][c]; if (cl?.ow !== me || cl.cd.type !== "being") continue;
        if (v.equipsPerBeing != null && (cl.eq || 0) >= v.equipsPerBeing) continue;
        acts.push({ type: "EQUIP", handIdx: hi, item: card, row: r, col: c });
      }
      // A set equip is free but only as the last action of the turn
      if (act === 1) for (const [r, c] of openSet) acts.push({ type: "SET_EQUIP", handIdx: hi, card, row: r, col: c, cost: 0 });
    }
  }

  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = bd[r][c]; if (!cl || cl.ow !== me) continue;
    if (cl.fd) {
      // Flip your own primed set card: free, limited per turn; set equips trigger by walking onto them instead
      if (cl.cd.type !== "equip" && (s.flips || 0) < v.flipsPerTurn && (cl.prm || 0) <= 0)
        acts.push({ type: cl.cd.type === "being" ? "FLIP_BEING" : cl.cd.type === "field" ? "FLIP_FIELD" : "FLIP_TRAP", row: r, col: c, cost: 0 });
      continue;
    }
    if (cl.cd.type !== "being" || act < 1) continue;
    const eS = effAt(cl.cd, cl.ib, bd, r, c, cfg);
    const isT = aura(eS) === 0;                     // effective aura zero: 2-cell moves, 8-way attacks
    const isFieldTrans = isT;                       // ...and may walk onto an enemy face-up field to diffuse it
    const mayAttack = canAttack(cl, v);
    for (const [tr, tc] of adj(r, c, isT ? 2 : 1)) {
      if (!canReach(r, c, tr, tc, bd)) continue;
      const d = bd[tr][tc];
      if (d) {
        if (d.fd) {
          if (d.ow === me && (d.cd.type === "being" || (d.cd.type === "equip" && (d.prm || 0) > 0))) continue;
          if (d.ow === opp && d.cd.type === "being") {
            // Walking onto an enemy set being is a blind attack
            if (cfg.BEING_SET_ENABLED && mayAttack) for (const st of STAT_DEFS) acts.push({ type: "SET_BATTLE", fromRow: r, fromCol: c, toRow: tr, toCol: tc, stat: st.key });
            continue;
          }
        } else if (d.cd.type === "field") {
          if (d.ow !== me && !isFieldTrans) continue;
        } else continue;
      }
      acts.push({ type: "MOVE", fromRow: r, fromCol: c, toRow: tr, toCol: tc });
    }
    if (mayAttack) for (const [tr, tc] of attackCells(r, c, isT, cfg)) {
      const t = bd[tr][tc]; if (!t || t.ow !== opp || t.cd.type !== "being" || t.fd) continue;
      for (const st of STAT_DEFS) acts.push({ type: "ATTACK", fromRow: r, fromCol: c, toRow: tr, toCol: tc, stat: st.key });
    }
  }

  if (act >= 1 && (s[DK(me)].length || s.pit[me].length)) acts.push({ type: "DRAW" });
  return acts;
}

// ─── Applying actions (mutates s — pass a clone) ────────────────────────────
// `ev`, when given, collects events: { t: "c", src, amt } for every C change,
// { t: "combat", winner, dmg }, { t: "zeroDraw", seat }, { t: "stepOn", kind } for a set field or spell walked onto.

function toPit(s, card, owner) { s.pit[owner].push(card); }

function reshuffle(s, seat, cfg) {
  if (s[DK(seat)].length || !s.pit[seat].length) return;
  s[DK(seat)] = shuffleWith(s.pit[seat], cfg.rng);
  s.pit[seat] = [];
}
function drawOne(s, seat, cfg) {
  reshuffle(s, seat, cfg);
  if (s[DK(seat)].length) s[HK(seat)].push(s[DK(seat)].shift());
}

export function applyC(s, amt, cfg, src, ev) {
  const prev = s.c, next = clampC(s, prev + amt, cfg.C_MAX, vr(cfg).turnCap);
  s.c = next;
  if (!s.cMoved && next !== prev) s.cMoved = true;
  if (ev && next !== prev) ev.push({ t: "c", src, amt: next - prev });
  const lightSeat = s.pRole === "light" ? "player" : "ai";
  const crossedZero = (prev > 0 && next < 0) || (prev < 0 && next > 0) || (prev !== 0 && next === 0);
  if (crossedZero && (src === "spell" || src === "trap" || vr(cfg).zeroCrossDraw === "all")) {
    // Awakening/Revenance: the side being pushed away from its goal draws up to 2 (no reshuffle)
    const seat = amt < 0 ? lightSeat : otherSeat(lightSeat);
    const dk = s[DK(seat)];
    if (dk.length) { s[HK(seat)].push(...dk.splice(0, Math.min(2, dk.length))); if (ev) ev.push({ t: "zeroDraw", seat }); }
  }
  if (s.c >= cfg.C_MAX) { s.ph = "over"; s.win = lightSeat; }
  else if (s.c <= -cfg.C_MAX) { s.ph = "over"; s.win = otherSeat(lightSeat); }
}

function combatC(s, dmg, winnerSeat, cfg, ev) {
  const cap = vr(cfg).combatCap;
  applyC(s, (cap != null ? Math.min(dmg, cap) : dmg) * seatDir(s, winnerSeat), cfg, "combat", ev);
}

// What a moving being finds on its destination. Returns true if the mover was consumed.
function land(s, r, c, mover, movingCell, cfg, ev) {
  const opp = otherSeat(mover), landCell = s.bd[r][c];
  if (!landCell) return false;
  const type = landCell.cd.type;
  if (landCell.fd && type === "being") return false; // set battle is resolved by SET_BATTLE
  if (landCell.fd && type === "field" && landCell.ow === opp) {
    // Enemy set field: the mover is destroyed and the field activates face-up
    if (ev) ev.push({ t: "stepOn", kind: "field sprung" });
    toPit(s, movingCell.cd, mover); landCell.fd = false; return true;
  }
  if (landCell.fd && landCell.ow === opp && isSpell(landCell.cd)) {
    if (ev) ev.push({ t: "stepOn", kind: "spell defused" });
    toPit(s, landCell.cd, opp); s.bd[r][c] = null; return false; // trap defused
  }
  if (landCell.fd && type === "equip" && landCell.ow === mover && (landCell.prm || 0) <= 0) {
    // Own primed set equip: picked up
    movingCell.ib = { ...zeroIb(), ...movingCell.ib };
    STAT_DEFS.forEach(st => { movingCell.ib[st.key] += landCell.cd[st.key] || 0; });
    movingCell.eq = (movingCell.eq || 0) + 1;
    toPit(s, landCell.cd, mover); s.bd[r][c] = null; return false;
  }
  if (landCell.fd && type === "equip" && landCell.ow === opp) { toPit(s, landCell.cd, opp); s.bd[r][c] = null; return false; } // equip diffused
  // Diffused face-up field, own field cleared, or any other card under the mover: discarded to its owner
  if (type !== "being") { toPit(s, landCell.cd, landCell.ow); s.bd[r][c] = null; }
  return false;
}

// A set field surrounded by 4+ enemy face-up beings is freed (discarded)
function fieldFreeings(s) {
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cell = s.bd[r][c]; if (!cell || !cell.fd || cell.cd.type !== "field") continue;
    const opp = otherSeat(cell.ow);
    const n = adjFull(r, c).filter(([ar, ac]) => { const nb = s.bd[ar][ac]; return nb && nb.ow === opp && nb.cd.type === "being" && !nb.fd; }).length;
    if (n >= 4) { toPit(s, cell.cd, cell.ow); s.bd[r][c] = null; }
  }
}

export function apply(s, a, cfg, ev) {
  const me = s.turn, opp = otherSeat(me), bd = s.bd, hand = s[HK(me)];
  switch (a.type) {
    case "PLAY_SPELL": {
      const card = hand.splice(a.handIdx, 1)[0], pwr = cPwr(card);
      s.act -= s.c === 0 && s.cMoved ? 0 : 1;
      applyC(s, card.type === "bless" ? pwr : -pwr, cfg, "spell", ev);
      if (pwr === 1) drawOne(s, me, cfg); // a 1C spell replaces itself
      toPit(s, card, me);
      break;
    }
    case "ATTACK": {
      const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc } = a;
      const atk = bd[fr][fc], def = bd[tr][tc];
      const res = resolveCombat(effAt(atk.cd, atk.ib, bd, fr, fc, cfg), effAt(def.cd, def.ib, bd, tr, tc, cfg), a.stat);
      atk.atk = (atk.atk || 0) + 1; s.act--;
      if (ev) ev.push({ t: "combat", winner: res.winner, dmg: res.dmg, wrap: isWrapAttack(fr, fc, tr, tc) });
      if (res.winner === "attacker") { bd[tr][tc] = null; toPit(s, def.cd, opp); combatC(s, res.dmg, me, cfg, ev); }
      else if (res.winner === "defender") { bd[fr][fc] = null; toPit(s, atk.cd, me); combatC(s, res.dmg, opp, cfg, ev); }
      else { bd[fr][fc] = null; bd[tr][tc] = null; toPit(s, atk.cd, me); toPit(s, def.cd, opp); } // tie: both destroyed
      break;
    }
    case "SET_BATTLE": {
      // The attacker leaves its cell and both fight on the defender's cell
      const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc } = a;
      const atk = bd[fr][fc], def = bd[tr][tc];
      bd[fr][fc] = null; def.fd = false;
      const res = resolveCombat(effAt(atk.cd, atk.ib, bd, tr, tc, cfg), effAt(def.cd, def.ib, bd, tr, tc, cfg), a.stat);
      atk.atk = (atk.atk || 0) + 1; atk.moved = true; s.act--;
      if (ev) ev.push({ t: "combat", winner: res.winner, dmg: res.dmg });
      if (res.winner === "attacker") { bd[tr][tc] = atk; toPit(s, def.cd, opp); combatC(s, res.dmg, me, cfg, ev); }
      else if (res.winner === "defender") { toPit(s, atk.cd, me); combatC(s, res.dmg, opp, cfg, ev); }
      else { bd[tr][tc] = null; toPit(s, atk.cd, me); toPit(s, def.cd, opp); }
      fieldFreeings(s);
      break;
    }
    case "MOVE": {
      const { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc } = a;
      const cl = bd[fr][fc];
      bd[fr][fc] = null;
      if (!land(s, tr, tc, me, cl, cfg, ev)) { bd[tr][tc] = cl; cl.moved = true; }
      fieldFreeings(s);
      s.act--;
      break;
    }
    case "SUMMON": {
      const card = hand.splice(a.handIdx, 1)[0], existing = bd[a.row][a.col];
      if (existing) toPit(s, existing.cd, existing.ow); // purge
      bd[a.row][a.col] = { cd: card, ow: me, fd: false, ib: zeroIb(), summonedThisTurn: true };
      s.act--;
      break;
    }
    case "TRIBUTE_SUMMON": {
      const card = hand.splice(a.handIdx, 1)[0];
      toPit(s, bd[a.tribRow][a.tribCol].cd, me); bd[a.tribRow][a.tribCol] = null;
      bd[a.row][a.col] = { cd: card, ow: me, fd: false, ib: zeroIb(), summonedThisTurn: true };
      s.act--;
      break;
    }
    case "PLAY_FIELD": bd[a.row][a.col] = { cd: hand.splice(a.handIdx, 1)[0], ow: me, fd: false, ib: zeroIb() }; s.act--; break;
    case "TERRAIN": bd[a.row][a.col] = { cd: hand.splice(a.handIdx, 1)[0], ow: me, fd: true, prm: 1, ib: zeroIb() }; break;
    case "EQUIP": {
      const item = hand.splice(a.handIdx, 1)[0], cl = bd[a.row][a.col];
      cl.ib = { ...zeroIb(), ...cl.ib };
      STAT_DEFS.forEach(st => { cl.ib[st.key] += item[st.key] || 0; });
      cl.eq = (cl.eq || 0) + 1;
      toPit(s, item, me); s.act--;
      break;
    }
    case "SET_TRAP": bd[a.row][a.col] = { cd: hand.splice(a.handIdx, 1)[0], ow: me, fd: true, prm: 1 }; s.act -= vr(cfg).trapSetCost; break;
    case "SET_EQUIP": bd[a.row][a.col] = { cd: hand.splice(a.handIdx, 1)[0], ow: me, fd: true, prm: 1 }; break;
    case "SET_BEING": bd[a.row][a.col] = { cd: hand.splice(a.handIdx, 1)[0], ow: me, fd: true, prm: 1, ib: zeroIb() }; break;
    case "FLIP_BEING": case "FLIP_FIELD": bd[a.row][a.col].fd = false; s.flips = (s.flips || 0) + 1; break;
    case "FLIP_TRAP": {
      const cl = bd[a.row][a.col], pwr = cPwr(cl.cd);
      bd[a.row][a.col] = null; s.flips = (s.flips || 0) + 1;
      applyC(s, cl.cd.type === "bless" ? pwr : -pwr, cfg, "trap", ev);
      toPit(s, cl.cd, me);
      break;
    }
    case "DRAW": s.act--; drawOne(s, me, cfg); break;
    default: throw new Error(`rules.apply: unknown action ${a.type}`);
  }
  return s;
}

// Non-mutating form: new state plus the events the action produced
export function applyAction(s, a, cfg) {
  const ev = [];
  return { state: apply(cloneState(s), a, cfg, ev), events: ev };
}

// Presence: after turn 3, the side with 2+ more face-up beings (centre 3×3 counts double) gains 1 C
function presence(s, cfg, ev) {
  if (!cfg.PRESENCE_ENABLED || s.ph === "over" || s.tn <= 3) return;
  let p = 0, a = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = s.bd[r][c]; if (cl?.cd.type !== "being" || cl.fd) continue;
    const w = (r >= 1 && r <= 3 && c >= 1 && c <= 3) ? 2 : 1;
    if (cl.ow === "player") p += w; else a += w;
  }
  if (Math.abs(p - a) < 2) return;
  applyC(s, seatDir(s, p > a ? "player" : "ai"), cfg, "presence", ev);
}

// King of the hill: after turn 2, a face-up card on the centre cell gains its owner 1 C
function center(s, cfg, ev) {
  if (!cfg.KOTH_ENABLED || s.ph === "over" || s.tn <= 2) return;
  const cl = s.bd[2][2];
  if (!cl || cl.fd || (vr(cfg).kothBeingsOnly && cl.cd.type !== "being")) return;
  applyC(s, seatDir(s, cl.ow), cfg, "center", ev);
}

// End the current seat's turn (mutates s): end-of-turn ticks, hand over, auto-draw, priming
export function endTurn(s, cfg, ev) {
  presence(s, cfg, ev);
  center(s, cfg, ev);
  if (s.ph === "over") return s;
  const next = otherSeat(s.turn);
  s.turn = next; s.act = cfg.actionsPerTurn; s.flips = 0; s.c0 = s.c;
  drawOne(s, next, cfg);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const cl = s.bd[r][c]; if (!cl) continue;
    if (cl.ow === next) { if (cl.fd && cl.prm > 0) cl.prm--; delete cl.summonedThisTurn; }
    delete cl.atk; delete cl.moved;
  }
  s.tn++;
  return s;
}
