import {
  STAT_DEFS, STAT_MIN, STAT_MAX, C_MAX, DECK_SIZE, HAND_SIZE, MAX_COPIES,
  TOKENS_START, TOKENS_PER_WIN, PACK_COST, CARDS_PER_PACK,
  TRIBUTE_SUMMON_ENABLED, THEME as T,
} from "./theme.js";

export function aura(c) { return STAT_DEFS.reduce((a, s) => a + (c[s.key] || 0), 0); }
export function orient(c) { const a = aura(c); return a > 0 ? "light" : a < 0 ? "dark" : "balanced"; }
export function oCol(o) { return o === "light" ? T.light : o === "dark" ? T.dark : T.balanced; }
export function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]]; } return b; }
export function gc(id, p) { return p.find(c => c.id === id); }

export function isSpell(cd) { return cd?.type === "bless" || cd?.type === "curse"; }

// Where C can go: within ±cMax, and with a turn cap (0 = off) no further than `turnCap`
// from c0, where it stood when the current turn began
export function turnRange(s, turnCap) {
  return turnCap > 0 && s.c0 != null ? [s.c0 - turnCap, s.c0 + turnCap] : null;
}
export function clampC(s, next, cMax, turnCap) {
  next = Math.max(-cMax, Math.min(cMax, next));
  const rg = turnRange(s, turnCap);
  return rg ? Math.max(rg[0], Math.min(rg[1], next)) : next;
}

// A card the viewer cannot see: no type, no numbers
export const UNKNOWN = Object.freeze({ id: "?", type: "unknown", soul: 0, mind: 0, will: 0 });
// The game as `seat` sees it — what an AI must plan on. The other hand, both decks' order and
// the other side's face-down cards are blanked.
export function viewFor(s, seat) {
  const opp = seat === "player" ? "ai" : "player", blank = xs => xs.map(() => UNKNOWN);
  return {
    ...s,
    bd: s.bd.map(row => row.map(cl => cl && cl.fd && cl.ow === opp ? { ...cl, cd: UNKNOWN } : cl)),
    pH: seat === "player" ? s.pH : blank(s.pH), aH: seat === "ai" ? s.aH : blank(s.aH),
    pD: blank(s.pD), aD: blank(s.aD),
  };
}
// How much an AI fears an enemy face-down card, in C (it is usually a spell waiting to be flipped)
export const SET_THREAT = 1;
// Planning odds for stepping onto a face-down enemy card: [chance, mover survives, card is cleared, C toward the mover].
// A spell or equip is cleared, a field destroys the mover, a being is a fight that could go either way.
export const BLIND_HIT = 2;
export function blindOdds(beingSet) {
  return beingSet
    ? [[0.5, true, true, 0], [0.25, false, false, 0], [0.125, true, true, BLIND_HIT], [0.125, false, false, -BLIND_HIT]]
    : [[0.65, true, true, 0], [0.35, false, false, 0]];
}
// The stat a being attacks with when it cannot see the defender: its own strongest
export function blindStat(eff) {
  return STAT_DEFS.reduce((best, st) => Math.abs(eff[st.key] || 0) > Math.abs(eff[best] || 0) ? st.key : best, STAT_DEFS[0].key);
}

export function cPwr(cd) {
  // `power` is the spell stat — a stale value left on a retyped non-spell card is ignored
  if (cd.power && isSpell(cd)) return cd.power;
  return Math.abs(cd.soul || 0) + Math.abs(cd.mind || 0) + Math.abs(cd.will || 0);
}

// Deck legality against the live settings. Errors block a game start; warnings don't.
export function validateDeck(deck, cardPool, { deckSize, maxCopies, spellBudget }) {
  const errors = [], warnings = [];
  const ids = deck?.cards || [];
  const copies = {}; let spellPwr = 0, missing = 0;
  for (const id of ids) {
    const c = gc(id, cardPool);
    if (!c) { missing++; continue; }
    copies[id] = (copies[id] || 0) + 1;
    if (isSpell(c)) spellPwr += cPwr(c);
  }
  const over = Object.values(copies).filter(n => n > maxCopies).length;
  if (spellPwr > spellBudget) errors.push(`spell power ${spellPwr}/${spellBudget}`);
  if (over) errors.push(`${over} card${over > 1 ? "s" : ""} over ${maxCopies} cop${maxCopies > 1 ? "ies" : "y"}`);
  if (ids.length - missing > deckSize) errors.push(`${ids.length - missing}/${deckSize} cards`);
  if (ids.length - missing < deckSize) warnings.push(`${ids.length - missing}/${deckSize} cards`);
  if (missing) warnings.push(`${missing} unknown card${missing > 1 ? "s" : ""}`);
  return { errors, warnings };
}

export function getDeckMagnitude(deck, cardPool) {
  if (!deck || !deck.cards) return 0;
  return deck.cards.reduce((sum, id) => {
    const c = gc(id, cardPool);
    if (!c) return sum;
    if (c.type === "bless") return sum + cPwr(c);
    if (c.type === "curse") return sum - cPwr(c);
    return sum + (c.soul || 0) + (c.mind || 0) + (c.will || 0);
  }, 0);
}

export function adj(r, c, d = 1) {
  const o = [];
  for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
    if (!dr && !dc) continue; if (Math.abs(dr) + Math.abs(dc) > d) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) o.push([nr, nc]);
  }
  return o;
}
// All 8 surrounding cells (Chebyshev distance 1) for transcendent entity range
export function adjFull(r, c) {
  const o = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) o.push([nr, nc]);
  }
  return o;
}
// Cells a being at (r, c) can attack: 4 orthogonal, or all 8 when its effective aura is zero.
// With the edge-wrap setting a zero-aura attacker also reaches over the board edges to the opposite side:
// "full" = every direction wraps; "straight" = a direction wraps only if it leaves the board on every axis it moves on.
export function attackCells(r, c, isZero, wrap) {
  if (!isZero) return adj(r, c, 1);
  if (wrap !== "full" && wrap !== "straight") return adjFull(r, c);
  const o = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc, offR = nr < 0 || nr > 4, offC = nc < 0 || nc > 4;
    if (wrap === "straight" && (offR || offC) && ((dr && !offR) || (dc && !offC))) continue;
    o.push([(nr + 5) % 5, (nc + 5) % 5]);
  }
  return o;
}
// True when an attack between two cells goes over a board edge
export const isWrapAttack = (r, c, tr, tc) => Math.abs(r - tr) > 1 || Math.abs(c - tc) > 1;
export function isTranscendent(c) { return (c.soul || 0) + (c.mind || 0) + (c.will || 0) === 0; }
export function isVoid(c) { return !c.soul && !c.mind && !c.will; } // strictly 0/0/0 — can purge terrain & traps
export function nextCardId(type, allCards) {
  const PREFIX = { being: "ENT", bless: "BLE", curse: "CUR", equip: "EQU", field: "TER" };
  const pfx = PREFIX[type] || "UNK";
  const re = new RegExp(`^${pfx}-(\\d{5})$`);
  let max = 0;
  for (const c of allCards) { const m = c.id?.match(re); if (m) max = Math.max(max, parseInt(m[1])); }
  return `${pfx}-${String(max + 1).padStart(5, "0")}`;
}
// Returns false if moving from (r,c) to (tr,tc) would jump over a blocking entity
export function canReach(r, c, tr, tc, bd) {
  const dr = tr - r, dc = tc - c;
  if (Math.abs(dr) === 2 && dc === 0) { const mid = bd[r + dr / 2]?.[c]; return !mid || mid.fd; }
  if (Math.abs(dc) === 2 && dr === 0) { const mid = bd[r]?.[c + dc / 2]; return !mid || mid.fd; }
  return true;
}
export function hasAdjField(r, c, bd) {
  return adj(r, c).some(([ar, ac]) => bd[ar]?.[ac]?.cd.type === "field");
}
export function hasAdjOccupied(r, c, bd) {
  return adj(r, c).some(([ar, ac]) => bd[ar]?.[ac] != null);
}
export function hasAdjSetOrField(r, c, bd) {
  return adjFull(r, c).some(([ar, ac]) => {
    const cl = bd[ar]?.[ac]; if (!cl) return false;
    return cl.fd || cl.cd?.type === "field";
  });
}
export function countAdjFaceUpFields(r, c, bd) {
  return adjFull(r, c).filter(([ar, ac]) => { const cl = bd[ar]?.[ac]; return cl?.cd?.type === "field" && !cl.fd; }).length;
}

export function tBonus(bd, r, c) {
  const b = { soul: 0, mind: 0, will: 0 };
  adjFull(r, c).forEach(([ar, ac]) => {
    const cl = bd[ar]?.[ac];
    if (cl?.cd?.type === "field" && !cl.fd) STAT_DEFS.forEach(s => { b[s.key] += cl.cd[s.key] || 0; });
  }); return b;
}

export function getEff(card, bd, r, c, ib) {
  let cd = { ...card }; STAT_DEFS.forEach(s => cd[s.key] = cd[s.key] || 0);
  const tb = tBonus(bd, r, c); const i = ib || { soul: 0, mind: 0, will: 0 };
  const out = {}; STAT_DEFS.forEach(s => { out[s.key] = cd[s.key] + tb[s.key] + (i[s.key] || 0); }); return out;
}

export function computeStartCounters(existingCards) {
  const r = {};
  for (const [type, prefix] of Object.entries(TYPE_PREFIX)) {
    const nums = existingCards.filter(c => c.id.startsWith(prefix + "-")).map(c => parseInt(c.id.slice(prefix.length + 1)) || 0);
    r[type] = (nums.length ? Math.max(...nums) : 0) + 1;
  }
  return r;
}

export function resolveCombat(aS, dS, stat) {
  const aV = Math.abs(aS[stat]), dV = Math.abs(dS[stat]);
  if (aV === dV) return { winner: "tie", dmg: 0 };
  if (aV > dV) return { winner: "attacker", dmg: aV - dV, winningStat: aS[stat] };
  return { winner: "defender", dmg: dV - aV, winningStat: dS[stat] };
}

export function flipSets(g, ow) {
  // Decrement priming for the current player's traps
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cl = g.bd[r][c];
      if (cl?.ow === ow) {
        if (cl.fd && cl.prm > 0) cl.prm--;
        if (cl.summonedThisTurn) delete cl.summonedThisTurn;
        if (cl.atk) delete cl.atk; // attacks-this-turn counter
      }
    }
  }
}

// ── Constants ────────────────────────────────────────────────────────────────
export const TYPE_PREFIX = { being: "ENT", bless: "BLE", curse: "CUR", equip: "EQU", field: "TER" };

export const JP_TYPES = { being: "存在", bless: "祝福", curse: "呪い", equip: "装備", field: "領域" };
export const JP_STATS = { soul: "魂", mind: "心", will: "意" };
export const JP = {
  // flash text
  "SUMMON":"召喚","FIELD":"領域","PURGE":"除去","EQUIP":"装備","SET":"伏せ","SET EQUIP":"装備セット",
  "TRIBUTE":"生贄","Genesis":"創世","RECYCLE":"再生","AWAKENING":"覚醒","REVENANCE":"回帰",
  "ENLIGHTENMENT":"悟り","OBLIVION":"虚無","DEFEAT":"敗北",
  "TRAP DEFUSED":"罠解除","FIELD ACTIVATED":"領域発動","FIELD DIFFUSED":"領域消滅",
  "FIELD FREED":"領域解放","EQUIP ACTIVATED":"装備発動","EQUIP DIFFUSED":"装備消滅",
  // turn panel
  "Your Turn":"あなたのターン","Opponent...":"相手のターン","Opponent's Turn":"相手のターン",
  "✦ VICTORY":"✦ 勝利","▽ DEFEAT":"▽ 敗北",
  // buttons
  "END TURN":"ターン終了","Cancel":"中止","Forfeit":"投了",
  "ending turn…":"終了中…","NEW GAME":"新ゲーム",
  // inspect
  "SECRET":"不明","HIDDEN":"秘密","You":"自分","Opp":"相手",
  // consciousness
  "NEXUS":"頂点",
};

export const CAMPAIGN_SET_IDS = ["set_a", "set_c", "set_d", "set_g", "set_l", "set_q", "set_r", "set_s", "set_u", "set_w", "set_x", "set_z"];

export const DEFAULT_SETTINGS = { cMax: C_MAX, handSize: HAND_SIZE, actionsPerTurn: 3, deckSize: DECK_SIZE, maxCopies: MAX_COPIES, spellBudget: 10, tokensStart: TOKENS_START, tokensPerWin: TOKENS_PER_WIN, packCost: PACK_COST, cardsPerPack: CARDS_PER_PACK, tributeSummonEnabled: false, beingSetEnabled: false, presenceEnabled: true, kingOfTheHillEnabled: false, combatCap: 0, turnCap: 0, attacksPerBeing: 0, edgeWrap: "off", locale: "en", slamAnim: true, cinemaMode: false, cinemaSwap: false, noAnim: false, pace: "normal", musicLinks: "", musicOn: true, musicVolume: 35 };

// How the computer opponent is paced. beat = pause before each of its actions while the board shows what is coming (ms, 0 = none);
// mult stretches the gap after each action.
export const PACES = { brisk: { beat: 0, mult: 1 }, normal: { beat: 600, mult: 1.2 }, relaxed: { beat: 950, mult: 1.6 } };

// Saved settings can predate newer keys — defaults fill the gaps so no rule is silently undefined
export function mergeSettings(saved) { return { ...DEFAULT_SETTINGS, ...(saved || {}) }; }

// ── Action types ─────────────────────────────────────────────────────────────
// Every mutation to game state must go through one of these identifiers.
// The sync layer uses them; game rules live in the handlers — not here.
export const ACTION_TYPES = {
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
  SET_BEING:      "SET_BEING",
  FLIP:           "FLIP",
  END_TURN:       "END_TURN",
};
