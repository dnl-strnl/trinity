// rules.js is the one rulebook: these lock in the rules transcribed from the human
// handlers, and prove both seats are treated identically (state vs. mirrored state).
import { describe, it, expect, vi } from "vitest";
import { mkRNG } from "../cardGen.js";
import { viewFor } from "../gameUtils.js";
import { aiPlan } from "../ai.js";
import {
  rulesCfg, newGame, legalActions, apply, applyAction, endTurn, cloneState,
  mirrorState, mirrorAction, deckSide, needsTribute,
} from "../rules.js";
import { plan, settle } from "../planner.js";
import { playGame } from "../../scripts/harness.js";

const being = (soul, mind, will, id) => ({ id, type: "being", soul, mind, will });
const spell = (type, power, id) => ({ id, type, power, soul: 0, mind: 0, will: 0 });
const emptyBoard = () => Array.from({ length: 5 }, () => Array(5).fill(null));
const up = (cd, ow, extra = {}) => ({ cd, ow, fd: false, ib: { soul: 0, mind: 0, will: 0 }, ...extra });

const mkCfg = (variant = {}, over = {}) => rulesCfg({
  C_MAX: 10, HAND_SIZE: 7, actionsPerTurn: 3, BEING_SET_ENABLED: true, TRIBUTE_SUMMON_ENABLED: true,
  PRESENCE_ENABLED: true, KOTH_ENABLED: false, rng: mkRNG(5), variant, ...over,
});
const state = (over = {}) => ({
  bd: emptyBoard(), pH: [], aH: [], pD: [], aD: [], pit: { player: [], ai: [] },
  c: 0, cMoved: false, turn: "player", act: 3, tn: 5, ph: "playing", win: null, pRole: "light", flips: 0, ...over,
});
const sig = a => [a.type, a.handIdx, (a.card || a.item)?.id, a.row, a.col, a.fromRow, a.fromCol, a.toRow, a.toCol, a.tribRow, a.tribCol, a.stat].join("|");
const find = (s, cfg, pred) => legalActions(s, cfg).find(pred);

// A varied deck: plain beings, a void, zero-aura beings, tribute-level beings, every support type
function testDeck(tag) {
  const cards = [];
  const shapes = [[4, 0, 0], [2, 1, 1], [-3, 2, 1], [0, 0, 0], [2, -2, 0], [4, 4, -1], [-4, -3, -2], [1, 1, 1], [3, -1, -2], [-2, 0, 3], [4, 2, 0], [-1, -1, -1], [3, 3, 0], [0, -4, 1]];
  shapes.forEach((st, i) => cards.push(being(...st, `${tag}-B${i}`)));
  [1, 1, 2, 3].forEach((p, i) => cards.push(spell(tag === "L" ? "bless" : "curse", p, `${tag}-S${i}`)));
  [[2, 0, 0], [-1, 2, -1], [0, 0, 3]].forEach((st, i) => cards.push({ ...being(...st, `${tag}-E${i}`), type: "equip" }));
  [[1, -1, 0], [0, 2, 2], [-2, 0, 0]].forEach((st, i) => cards.push({ ...being(...st, `${tag}-F${i}`), type: "field" }));
  return cards;
}

describe("canonical rules", () => {
  it("combat moves C by the stat difference toward the winner and discards the loser", () => {
    const cfg = mkCfg();
    const s = state();
    s.bd[3][2] = up(being(3, 0, 0, "A"), "player");
    s.bd[2][2] = up(being(1, 4, 0, "D"), "ai");
    const win = applyAction(s, find(s, cfg, a => a.type === "ATTACK" && a.stat === "soul"), cfg);
    expect(win.state.c).toBe(2);
    expect(win.state.bd[2][2]).toBeNull();
    expect(win.state.pit.ai.map(c => c.id)).toEqual(["D"]);
    expect(win.events).toContainEqual({ t: "c", src: "combat", amt: 2 });
    const lose = applyAction(s, find(s, cfg, a => a.type === "ATTACK" && a.stat === "mind"), cfg).state;
    expect(lose.c).toBe(-4);
    expect(lose.bd[3][2]).toBeNull();
    const tie = applyAction(s, find(s, cfg, a => a.type === "ATTACK" && a.stat === "will"), cfg).state;
    expect(tie.c).toBe(0);
    expect(tie.bd[3][2]).toBeNull();
    expect(tie.bd[2][2]).toBeNull();
  });

  it("a set trap is free, primes over the opponent's turn, then flips for free", () => {
    const cfg = mkCfg();
    let s = state({ pH: [spell("bless", 2, "S")], pD: [being(1, 1, 1, "X")], aD: [being(1, 1, 1, "Y")] });
    s = applyAction(s, find(s, cfg, a => a.type === "SET_TRAP" && a.row === 3 && a.col === 0), cfg).state;
    expect(s.act).toBe(3);
    expect(legalActions(s, cfg).some(a => a.type === "FLIP_TRAP")).toBe(false); // still priming
    endTurn(s, cfg); endTurn(s, cfg);
    expect(s.turn).toBe("player");
    s = applyAction(s, find(s, cfg, a => a.type === "FLIP_TRAP"), cfg).state;
    expect(s.c).toBe(2);
    expect(s.act).toBe(3);
    expect(s.flips).toBe(1);
  });

  it("a spell costs an action, except at exactly 0 once C has moved; a 1C spell draws", () => {
    const cfg = mkCfg();
    const s = state({ pH: [spell("bless", 1, "S1"), spell("bless", 2, "S2")], pD: [being(1, 1, 1, "X")] });
    expect(find(s, cfg, a => a.type === "PLAY_SPELL").cost).toBe(1); // C hasn't moved yet
    const after = applyAction(s, find(s, cfg, a => a.type === "PLAY_SPELL" && a.card.id === "S1"), cfg).state;
    expect(after.act).toBe(2);
    expect(after.c).toBe(1);
    expect(after.pH.map(c => c.id)).toEqual(["S2", "X"]);
    const nexus = state({ cMoved: true, pH: [spell("bless", 2, "S2")] });
    expect(applyAction(nexus, find(nexus, cfg, a => a.type === "PLAY_SPELL"), cfg).state.act).toBe(3);
  });

  it("crossing zero draws 2 for the side pushed back — spells only, unless the variant says all", () => {
    const deck = [being(1, 1, 1, "X"), being(1, 1, 1, "Y"), being(1, 1, 1, "Z")];
    // Dark (ai) curses C from +1 to -1: the light player draws 2
    const s = state({ turn: "ai", c: 1, cMoved: true, aH: [spell("curse", 2, "S")], pD: [...deck] });
    expect(applyAction(s, find(s, mkCfg(), a => a.type === "PLAY_SPELL"), mkCfg()).state.pH).toHaveLength(2);
    // The same crossing by combat draws nothing today
    const fight = state({ turn: "ai", c: 1, cMoved: true, pD: [...deck] });
    fight.bd[1][2] = up(being(3, 0, 0, "A"), "ai");
    fight.bd[2][2] = up(being(1, 0, 0, "D"), "player");
    const hit = a => a.type === "ATTACK" && a.stat === "soul";
    expect(applyAction(fight, find(fight, mkCfg(), hit), mkCfg()).state.pH).toHaveLength(0);
    const all = mkCfg({ zeroCrossDraw: "all" });
    expect(applyAction(fight, find(fight, all, hit), all).state.pH).toHaveLength(2);
  });

  it("walking onto an enemy set field destroys the mover and reveals the field", () => {
    const cfg = mkCfg();
    const s = state();
    const field = { id: "F", type: "field", soul: 1, mind: 0, will: 0 };
    s.bd[3][2] = up(being(2, 1, 1, "M"), "player");
    s.bd[2][2] = { cd: field, ow: "ai", fd: true, prm: 0, ib: { soul: 0, mind: 0, will: 0 } };
    const after = applyAction(s, find(s, cfg, a => a.type === "MOVE" && a.toRow === 2), cfg).state;
    expect(after.bd[3][2]).toBeNull();
    expect(after.bd[2][2].fd).toBe(false);
    expect(after.pit.player.map(c => c.id)).toEqual(["M"]);
  });

  it("walking onto an enemy set spell defuses it: discarded, no C moves", () => {
    const cfg = mkCfg(), s = state();
    s.bd[3][2] = up(being(1, 1, 1, "M"), "player"); s.bd[1][1] = up(being(2, 2, 2, "N"), "ai");
    s.bd[2][2] = { cd: spell("curse", 2, "T"), ow: "ai", fd: true, prm: 1 };
    apply(s, find(s, cfg, a => a.type === "MOVE" && a.toRow === 2 && a.toCol === 2), cfg);
    expect(s.c).toBe(0);
    expect(s.bd[2][2].cd.id).toBe("M");
    expect(s.pit.ai.map(c => c.id)).toEqual(["T"]);
  });

  it("a zero-aura being can be summoned onto any face-down card, set equips included", () => {
    const cfg = mkCfg(), s = state({ pH: [being(2, -1, -1, "Z")] });
    s.bd[1][1] = { cd: { ...being(0, 1, 0, "E"), type: "equip" }, ow: "ai", fd: true, prm: 1 };
    s.bd[1][3] = { cd: spell("curse", 2, "T"), ow: "ai", fd: true, prm: 1 };
    const purges = legalActions(s, cfg).filter(a => a.type === "SUMMON" && a.isPurge).map(a => `${a.row},${a.col}`);
    expect(purges.sort()).toEqual(["1,1", "1,3"]);
    apply(s, find(s, cfg, a => a.type === "SUMMON" && a.row === 1 && a.col === 1), cfg);
    expect(s.bd[1][1]).toMatchObject({ ow: "player", fd: false, cd: { id: "Z" } });
    expect(s.pit.ai.map(c => c.id)).toEqual(["E"]);
  });

  it("any zero-aura being, printed zero included, walks onto an enemy face-up field and destroys it", () => {
    const cfg = mkCfg(), s = state();
    const onto = a => a.type === "MOVE" && a.toRow === 2 && a.toCol === 2;
    s.bd[2][2] = up({ ...being(1, 0, 0, "F"), type: "field" }, "ai");
    s.bd[3][2] = up(being(2, 0, 0, "N"), "player");
    expect(find(s, cfg, onto)).toBeUndefined(); // an ordinary being is blocked
    // Next to the field its S+1 makes the being aura +1, so it is not zero-aura there
    s.bd[3][2] = up(being(2, -1, -1, "Z"), "player");
    expect(find(s, cfg, onto)).toBeUndefined();
    // From two cells away it still is, and its two-step move carries it in
    s.bd[3][2] = null; s.bd[4][2] = up(being(2, -1, -1, "Z"), "player");
    apply(s, find(s, cfg, onto), cfg);
    expect(s.bd[2][2]).toMatchObject({ ow: "player", cd: { id: "Z" } });
    expect(s.pit.ai.map(c => c.id)).toEqual(["F"]);
  });

  it("presence ticks 1 C toward the side with 2+ more weighted beings, after turn 3", () => {
    const cfg = mkCfg();
    const s = state({ aD: [being(1, 1, 1, "Y")] });
    s.bd[2][2] = up(being(1, 1, 1, "A"), "player"); // centre counts double
    endTurn(s, cfg);
    expect(s.c).toBe(1);
    const early = state({ tn: 3 });
    early.bd[2][2] = up(being(1, 1, 1, "A"), "player");
    endTurn(early, cfg);
    expect(early.c).toBe(0);
  });

  it("tribute-level beings need a sacrifice; sides come from deck magnitude", () => {
    expect(needsTribute(being(4, 4, -1, "T"), mkCfg())).toBe(true);
    expect(needsTribute(being(4, -4, 1, "T"), mkCfg())).toBe(false);
    expect(needsTribute(being(4, -4, 1, "T"), mkCfg({ tributeBy: "total" }))).toBe(true);
    const blessDeckOfDarkBeings = [spell("bless", 3, "S"), being(-4, -4, -4, "B")];
    expect(deckSide(blessDeckOfDarkBeings, mkCfg())).toBe("dark");
    expect(deckSide(blessDeckOfDarkBeings, mkCfg({ sideBySpells: true }))).toBe("light");
  });
});

describe("rule variants", () => {
  const duel = () => {
    const s = state();
    s.bd[3][2] = up(being(4, 0, 0, "A"), "player");
    s.bd[2][2] = up(being(0, 1, 1, "D1"), "ai");
    s.bd[3][1] = up(being(0, 1, 1, "D2"), "ai");
    return s;
  };
  const attacks = (s, cfg) => legalActions(s, cfg).filter(a => a.type === "ATTACK");

  it("attacksPerBeing limits a being to that many attacks a turn", () => {
    const cfg = mkCfg({ attacksPerBeing: 1 });
    const s = duel();
    apply(s, find(s, cfg, a => a.type === "ATTACK" && a.stat === "soul" && a.toRow === 2), cfg);
    expect(attacks(s, cfg)).toHaveLength(0);
    expect(attacks(apply(duel(), find(duel(), mkCfg(), a => a.type === "ATTACK" && a.stat === "soul" && a.toRow === 2), mkCfg()), mkCfg()).length).toBeGreaterThan(0);
    endTurn(s, cfg); endTurn(s, cfg);
    expect(attacks(s, cfg).length).toBeGreaterThan(0); // refreshed next turn
  });

  it("combatCap and statCap bound a single hit", () => {
    const s = duel();
    const hit = a => a.type === "ATTACK" && a.stat === "soul" && a.toRow === 2;
    expect(applyAction(s, find(s, mkCfg(), hit), mkCfg()).state.c).toBe(4);
    expect(applyAction(s, find(s, mkCfg({ combatCap: 3 }), hit), mkCfg({ combatCap: 3 })).state.c).toBe(3);
    s.bd[3][2].ib = { soul: 5, mind: 0, will: 0 }; // equips push soul to 9
    expect(applyAction(s, find(s, mkCfg(), hit), mkCfg()).state.c).toBe(9);
    expect(applyAction(s, find(s, mkCfg({ statCap: 6 }), hit), mkCfg({ statCap: 6 })).state.c).toBe(6);
  });

  it("summonSick and movedCantAttack stop a being attacking on arrival", () => {
    const s = state({ pH: [being(4, 0, 0, "A")] });
    s.bd[2][2] = up(being(0, 1, 1, "D"), "ai");
    const summon = a => a.type === "SUMMON" && a.row === 3 && a.col === 2;
    expect(attacks(apply(cloneState(s), find(s, mkCfg(), summon), mkCfg()), mkCfg()).length).toBeGreaterThan(0);
    const sick = mkCfg({ summonSick: true });
    expect(attacks(apply(cloneState(s), find(s, sick, summon), sick), sick)).toHaveLength(0);

    const m = state();
    m.bd[4][2] = up(being(4, 0, 0, "A"), "player");
    m.bd[2][2] = up(being(0, 1, 1, "D"), "ai");
    const still = mkCfg({ movedCantAttack: true });
    apply(m, find(m, still, a => a.type === "MOVE" && a.toRow === 3 && a.toCol === 2), still);
    expect(attacks(m, still)).toHaveLength(0);
  });
});

describe("turn cap (setting, off by default)", () => {
  it("C moves at most turnCap from where the turn began, in either direction, and resets each turn", () => {
    const cfg = mkCfg({ turnCap: 5 }), s = state({ c: 4, c0: 4, pH: [spell("bless", 3, "B1"), spell("bless", 3, "B2")] });
    apply(s, find(s, cfg, a => a.type === "PLAY_SPELL" && a.card.id === "B1"), cfg);
    apply(s, find(s, cfg, a => a.type === "PLAY_SPELL" && a.card.id === "B2"), cfg);
    expect(s.c).toBe(9);           // 4 + 3 + 3 would be 10, a win; the cap stops it at 4 + 5
    expect(s.ph).toBe("playing");
    endTurn(s, cfg);
    expect(s.c0).toBe(9);
    const t = state({ c: 0, c0: 0, pH: [spell("curse", 3, "K1"), spell("curse", 3, "K2")] });
    apply(t, find(t, cfg, a => a.type === "PLAY_SPELL" && a.card.id === "K1"), cfg);
    apply(t, find(t, cfg, a => a.type === "PLAY_SPELL"), cfg);
    expect(t.c).toBe(-5);
  });

  it("caps a fight's C as well, and is off without the variant", () => {
    const fight = cfg => {
      const s = state({ c: 3, c0: 0 });
      s.bd[3][2] = up(being(4, 0, 0, "A"), "player"); s.bd[2][2] = up(being(0, 1, 1, "D"), "ai");
      return apply(s, find(s, cfg, a => a.type === "ATTACK" && a.stat === "soul"), cfg).c;
    };
    expect(fight(mkCfg({ turnCap: 5 }))).toBe(5);
    expect(fight(mkCfg())).toBe(7);
  });

  it("the live AI respects the cap when it plans", () => {
    const s = state({ turn: "ai", c: -4, c0: -4, pRole: "light", aH: [spell("curse", 3, "K1"), spell("curse", 3, "K2")] });
    const seq = aiPlan(s, { C_MAX: 10, TURN_CAP: 5, BEING_SET_ENABLED: true, TRIBUTE_SUMMON_ENABLED: true, PRESENCE_ENABLED: true, KOTH_ENABLED: false });
    expect(seq.filter(a => a.isLethal)).toEqual([]);
  });
});

describe("seat symmetry", () => {
  const sortSigs = acts => acts.map(sig).sort();

  it("a state and its mirror have mirrored legal actions and mirrored outcomes", () => {
    const rng = mkRNG(11);
    let checked = 0;
    for (let game = 0; game < 6; game++) {
      const cfg = mkCfg({}, { rng: mkRNG(100 + game) });
      const s = newGame(testDeck("L"), testDeck("D"), cfg);
      for (let step = 0; step < 120 && s.ph === "playing"; step++) {
        const acts = legalActions(s, cfg), m = mirrorState(s);
        expect(sortSigs(legalActions(m, cfg))).toEqual(sortSigs(acts.map(mirrorAction)));
        if (!acts.length || rng() < 0.25) { endTurn(s, cfg); continue; }
        const a = acts[Math.floor(rng() * acts.length)];
        // Same RNG seed on both sides so a reshuffle lands the same way
        const direct = apply(cloneState(s), a, { ...cfg, rng: mkRNG(step + 1) });
        const viaMirror = apply(m, mirrorAction(a), { ...cfg, rng: mkRNG(step + 1) });
        expect(mirrorState(viaMirror)).toEqual(direct);
        apply(s, a, cfg);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("the planner picks the mirrored plan for the mirrored position", () => {
    const cfg = mkCfg({}, { rng: mkRNG(21) });
    const s = newGame(testDeck("L"), testDeck("D"), cfg);
    for (let turn = 0; turn < 8 && s.ph === "playing"; turn++) {
      const seq = plan(s, cfg, mkRNG(turn + 1));
      expect(plan(mirrorState(s), cfg, mkRNG(turn + 1)).map(sig)).toEqual(seq.map(mirrorAction).map(sig));
      const legal = new Set(legalActions(s, cfg).map(sig));
      if (seq.length) expect(legal.has(sig(seq[0]))).toBe(true);
      for (const a of seq) if (legalActions(s, cfg).some(l => sig(l) === sig(a))) apply(s, a, cfg);
      endTurn(s, cfg);
    }
  });
});

describe("harness", () => {
  it("replays the same game from the same seed and always ends by C", () => {
    const play = seed => playGame(testDeck("L"), testDeck("D"), mkCfg({}, { rng: mkRNG(seed) }), 200);
    const a = play(3), b = play(3);
    expect([a.winner, a.turns, a.finalC, a.hits]).toEqual([b.winner, b.turns, b.finalC, b.hits]);
    expect(Math.abs(a.finalC)).toBe(10);
    expect(a.winner).toBe(a.finalC > 0 === (a.pRole === "light") ? "player" : "ai");
  });
});

describe("hidden information", () => {
  const set = (cd, ow) => ({ cd, ow, fd: true, prm: 0, ib: { soul: 0, mind: 0, will: 0 } });
  const field = { id: "HF", type: "field", soul: 0, mind: -2, will: 0 };
  // The ai seat to move. `hidden` is the player's set card at (2,2); the hands and decks differ too.
  const position = (hidden, pH, aD) => state({
    turn: "ai", c: 6, cMoved: true, pH, aD, pD: [...pH].reverse(),
    aH: [being(-2, -1, 0, "H1"), spell("curse", 1, "H2"), spell("curse", 2, "H3")],
    bd: Object.assign(emptyBoard(), {
      1: [null, null, up(being(-3, -1, -2, "A1"), "ai"), null, null],
      2: [null, null, set(hidden, "player"), null, up(being(-1, -1, 0, "A2"), "ai")],
      3: [null, up(being(2, 1, 1, "P1"), "player"), null, null, up(being(0, 3, 1, "P2"), "player")],
    }),
  });
  // What the old AI reacted to: a weak set being to attack, winning spells in the player's hand, a known top card
  const open = position(being(0, 1, 0, "HB"), [spell("bless", 3, "X1"), spell("bless", 2, "X2")], [being(-4, -4, 0, "T1"), spell("curse", 3, "T2")]);
  const shut = position(field, [being(1, 1, 1, "X3"), being(2, 0, 0, "X4")], [spell("curse", 3, "T2"), being(-4, -4, 0, "T1")]);

  it("viewFor blanks the other hand, both decks and the other side's face-down cards", () => {
    const v = viewFor(open, "ai");
    expect(v.bd[2][2]).toMatchObject({ ow: "player", fd: true, cd: { type: "unknown" } });
    expect(v.bd[3][1].cd.id).toBe("P1");
    expect(v.pH.map(c => c.type)).toEqual(["unknown", "unknown"]);
    expect(v.aD.map(c => c.type)).toEqual(["unknown", "unknown"]);
    expect(v.aH).toBe(open.aH);
    expect(viewFor(open, "player").bd[2][2].cd.id).toBe("HB");
    expect(JSON.stringify(viewFor(open, "ai"))).toBe(JSON.stringify(viewFor(shut, "ai")));
    const equip = position({ ...field, type: "equip" }, shut.pH, shut.aD);
    expect(JSON.stringify(viewFor(equip, "ai"))).toBe(JSON.stringify(viewFor(shut, "ai")));
  });

  it("the planner makes the same plan whatever the hidden cards are", () => {
    for (let seed = 1; seed <= 6; seed++)
      expect(plan(open, mkCfg(), mkRNG(seed)).map(sig)).toEqual(plan(shut, mkCfg(), mkRNG(seed)).map(sig));
    const mirrored = seed => plan(mirrorState(open), mkCfg(), mkRNG(seed)).map(sig);
    expect(mirrored(2)).toEqual(plan(mirrorState(shut), mkCfg(), mkRNG(2)).map(sig));
  });

  it("the live AI makes the same plan whatever the hidden cards are", () => {
    const cfg = { C_MAX: 10, BEING_SET_ENABLED: true, TRIBUTE_SUMMON_ENABLED: true, PRESENCE_ENABLED: true, KOTH_ENABLED: false };
    const live = (s, seed) => {
      const rnd = mkRNG(seed), spy = vi.spyOn(Math, "random").mockImplementation(rnd);
      try { return aiPlan(s, cfg).map(sig); } finally { spy.mockRestore(); }
    };
    for (let seed = 1; seed <= 6; seed++) expect(live(open, seed)).toEqual(live(shut, seed));
    expect(live(open, 1).length).toBeGreaterThan(0);
  });

  it("a blind step onto a set being is a blind battle with the stat chosen beforehand", () => {
    const step = { type: "MOVE", fromRow: 1, fromCol: 2, toRow: 2, toCol: 2, blind: true, reveals: true, stat: "soul" };
    expect(settle(open, step)).toMatchObject({ type: "SET_BATTLE", stat: "soul" });
    expect(legalActions(open, mkCfg()).map(sig)).toContain(sig(settle(open, step)));
    expect(legalActions(shut, mkCfg()).map(sig)).toContain(sig(settle(shut, step)));
    expect(settle(shut, step).type).toBe("MOVE");
  });

  it("no card can be flipped on the turn it is set, beings included", () => {
    const cfg = mkCfg(), s = state({ pH: [being(2, 1, 0, "B")] });
    apply(s, find(s, cfg, a => a.type === "SET_BEING"), cfg);
    expect(legalActions(s, cfg).some(a => a.type === "FLIP_BEING")).toBe(false);
    endTurn(s, cfg); endTurn(s, cfg);
    expect(legalActions(s, cfg).some(a => a.type === "FLIP_BEING")).toBe(true);
  });
});
