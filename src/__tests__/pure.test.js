// Regression tripwire for the pure game modules (gameUtils, cardGen, ai).
// These lock in behavior during the Trinity.jsx refactor — they test rules
// math, generator determinism, and that the AI planner returns legal plans.
import { describe, it, expect } from "vitest";
import {
  aura, orient, cPwr, adj, adjFull, canReach, resolveCombat, getEff,
  computeStartCounters, DEFAULT_SETTINGS, ACTION_TYPES,
} from "../gameUtils.js";
import { mkRNG, genCardsForParams, generateStructureDecks } from "../cardGen.js";
import { aiPlan, aiActions } from "../ai.js";

const being = (soul, mind, will, extra = {}) => ({ id: "ENT-1", type: "being", soul, mind, will, ...extra });

describe("gameUtils rules math", () => {
  it("aura sums stats; orient maps sign to light/dark/balanced", () => {
    expect(aura(being(2, 1, 1))).toBe(4);
    expect(orient(being(2, 1, 1))).toBe("light");
    expect(orient(being(-2, -1, 0))).toBe("dark");
    expect(orient(being(1, -1, 0))).toBe("balanced");
  });

  it("cPwr uses a spell's explicit power, else the abs-stat sum", () => {
    expect(cPwr({ type: "bless", power: 3 })).toBe(3);
    expect(cPwr(being(-2, 1, 1))).toBe(4);
  });

  it("adj is manhattan-1, adjFull includes diagonals, both clipped to 5x5", () => {
    expect(adj(0, 0).sort()).toEqual([[0, 1], [1, 0]].sort());
    expect(adjFull(0, 0)).toHaveLength(3);
    expect(adj(2, 2)).toHaveLength(4);
    expect(adjFull(2, 2)).toHaveLength(8);
  });

  it("canReach gates 2-step jumps on the cell between being empty or face-down", () => {
    const bd = Array.from({ length: 5 }, () => Array(5).fill(null));
    expect(canReach(2, 2, 2, 4, bd)).toBe(true);
    bd[2][3] = { cd: being(1, 1, 1), ow: "player", fd: false };
    expect(canReach(2, 2, 2, 4, bd)).toBe(false);
    bd[2][3].fd = true;
    expect(canReach(2, 2, 2, 4, bd)).toBe(true);
  });

  it("resolveCombat compares absolute stats and reports margin", () => {
    expect(resolveCombat({ soul: 3 }, { soul: 1 }, "soul")).toEqual({ winner: "attacker", dmg: 2, winningStat: 3 });
    expect(resolveCombat({ soul: -1 }, { soul: 4 }, "soul")).toEqual({ winner: "defender", dmg: 3, winningStat: 4 });
    expect(resolveCombat({ soul: 2 }, { soul: -2 }, "soul")).toEqual({ winner: "tie", dmg: 0 });
  });

  it("getEff adds terrain and item bonuses to base stats", () => {
    const bd = Array.from({ length: 5 }, () => Array(5).fill(null));
    expect(getEff(being(1, 2, 3), bd, 2, 2, { soul: 1, mind: 0, will: -1 }))
      .toEqual({ soul: 2, mind: 2, will: 2 });
  });

  it("computeStartCounters resumes per-type id counters", () => {
    const counters = computeStartCounters([{ id: "ENT-7" }, { id: "ENT-3" }, { id: "BLE-2" }]);
    expect(counters.being).toBe(8);
    expect(counters.bless).toBe(3);
    expect(counters.curse).toBe(1);
  });

  it("DEFAULT_SETTINGS carries the KOTH flag, off by default", () => {
    expect(DEFAULT_SETTINGS.kingOfTheHillEnabled).toBe(false);
  });
});

describe("cardGen determinism", () => {
  const genCfg = {
    name: "Test Set", total: 20,
    pctEntity: 50, pctBless: 15, pctCurse: 15, pctTerrain: 10, pctItem: 10,
    powerMin: 2, powerMax: 6,
    blessPwrMin: 1, blessPwrMax: 3, cursePwrMin: 1, cursePwrMax: 3,
    rarCommon: 64, rarUncommon: 24, rarRare: 8, rarLegendary: 4,
  };

  it("mkRNG is deterministic per seed", () => {
    const a = mkRNG(123), b = mkRNG(123), c = mkRNG(124);
    const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    seqA.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });

  it("genCardsForParams yields the requested count with same-seed identical stats", () => {
    const make = () => genCardsForParams({ ...genCfg, images: {}, mode: "random", ts: 1000, counters: { being: 1, bless: 1, curse: 1, equip: 1, field: 1 }, rng: mkRNG(42) });
    const cards1 = make(), cards2 = make();
    expect(cards1).toHaveLength(20);
    expect(cards1.map(c => [c.type, c.soul, c.mind, c.will, c.rarity]))
      .toEqual(cards2.map(c => [c.type, c.soul, c.mind, c.will, c.rarity]));
    for (const c of cards1) expect(["being", "bless", "curse", "equip", "field"]).toContain(c.type);
  });

  it("generateStructureDecks builds the requested decks at deckSize", () => {
    const pool = genCardsForParams({ ...genCfg, total: 120, images: {}, mode: "random", ts: 2000, counters: { being: 1, bless: 1, curse: 1, equip: 1, field: 1 }, rng: mkRNG(7) });
    const decks = generateStructureDecks({
      autoGenCfg: { count: 2, deckSize: 20, factionMode: "mixed", artOnly: false },
      cardPool: pool, existingDeckCount: 0, maxCopies: 3,
    });
    expect(decks).toHaveLength(2);
    for (const d of decks) {
      expect(d.cards).toHaveLength(20);
      expect(d.name).toBeTruthy();
    }
  });
});

describe("ai planner", () => {
  const cfg = { C_MAX: 10, BEING_SET_ENABLED: false, TRIBUTE_SUMMON_ENABLED: false, PRESENCE_ENABLED: true, KOTH_ENABLED: false };
  const emptyBoard = () => Array.from({ length: 5 }, () => Array(5).fill(null));

  const baseState = () => ({
    bd: emptyBoard(),
    aH: [being(2, 1, 1, { id: "ENT-9" }), { id: "BLE-9", type: "bless", power: 2 }],
    aD: [being(1, 1, 1, { id: "ENT-10" })],
    pH: [], pD: [],
    c: 0, act: 3, tn: 5, turn: "ai", ph: "playing", pRole: "light", flips: 0,
  });

  it("aiActions enumerates legal moves (spell play + draw at minimum)", () => {
    const acts = aiActions(baseState(), cfg);
    expect(acts.length).toBeGreaterThan(0);
    const types = new Set(acts.map(a => a.type));
    expect(types.has("PLAY_SPELL")).toBe(true);
    expect(types.has("DRAW")).toBe(true);
  });

  it("aiPlan returns a sequence of known planner action types without mutating input", () => {
    const s = baseState();
    const snapshot = JSON.stringify(s);
    const plan = aiPlan(s, cfg);
    expect(Array.isArray(plan)).toBe(true);
    const known = new Set(["PLAY_SPELL", "ATTACK", "MOVE", "SUMMON", "TRIBUTE_SUMMON", "TERRAIN", "EQUIP", "SET_TRAP", "SET_EQUIP", "SET_BEING", "SET_BATTLE", "FLIP_FIELD", "FLIP_TRAP", "FLIP_BEING", "PLAY_FIELD", "DRAW"]);
    for (const a of plan) expect(known.has(a.type)).toBe(true);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("aiPlan (as dark) prefers lethal curse when one point from winning", () => {
    const s = baseState();
    s.pRole = "light"; // AI is dark side: wins at c = -C_MAX
    s.c = -9;
    s.aH = [{ id: "CUR-9", type: "curse", power: 2 }];
    const plan = aiPlan(s, cfg);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0].type).toBe("PLAY_SPELL");
    expect(plan[0].isLethal).toBe(true);
  });
});

describe("action vocabulary", () => {
  it("ACTION_TYPES exposes the sync-layer vocabulary", () => {
    expect(ACTION_TYPES.PLAY_BC).toBe("PLAY_BC");
    expect(ACTION_TYPES.END_TURN).toBe("END_TURN");
  });
});
