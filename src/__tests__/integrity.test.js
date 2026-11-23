// Rule-integrity regressions: settings merge, deck legality, and the engine paths
// where the AI seat used to play by different rules than the human seat.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cPwr, mergeSettings, validateDeck, flipSets, DEFAULT_SETTINGS } from "../gameUtils.js";
import { chkTraps, runAI } from "../engine.js";
import { aiApply, aiActions, aiClone } from "../ai.js";

const being = (soul, mind, will, id = "ENT-1") => ({ id, type: "being", soul, mind, will });
const emptyBoard = () => Array.from({ length: 5 }, () => Array(5).fill(null));
const cell = (cd, ow, extra = {}) => ({ cd, ow, fd: false, ib: { soul: 0, mind: 0, will: 0 }, ...extra });

// Minimal stand-in for the fx bag Trinity.jsx hands the engine
function mkFx() {
  const fx = {
    C_MAX: 10, actionsPerTurn: 3, TOKENS_PER_WIN: 1, jp: false,
    pit: { player: [], ai: [] },
    setPit: fn => { fx.pit = fn(fx.pit); },
    setGame: g => { fx.game = g; },
    setRecentPit: () => {}, addLog: () => {}, enqF: () => {}, playSfx: () => {},
    setAiR: () => {}, setTokens: () => {}, saveGameLog: () => {}, setEqFlash: () => {},
    videoFor: () => null,
    forfeitRef: { current: false }, fB: { current: false }, aiPlanRef: { current: [] },
  };
  return fx;
}
const baseState = (over = {}) => ({
  bd: emptyBoard(), aH: [], aD: [], pH: [], pD: [],
  c: 0, cMoved: false, act: 3, tn: 5, turn: "ai", ph: "playing", pRole: "light", flips: 0, ...over,
});
// Run one pre-planned AI action through the executor (idx 1 skips the planner)
function runOne(s, action) {
  const fx = mkFx();
  fx.aiPlanRef.current = [null, action];
  runAI(s, 1, fx);
  return fx;
}

describe("settings", () => {
  it("mergeSettings fills keys missing from an older save and keeps saved values", () => {
    const merged = mergeSettings({ cMax: 12, maxCopies: 1 });
    expect(merged.cMax).toBe(12);
    expect(merged.maxCopies).toBe(1);
    expect(merged.spellBudget).toBe(DEFAULT_SETTINGS.spellBudget);
    expect(merged.presenceEnabled).toBe(DEFAULT_SETTINGS.presenceEnabled);
    expect(merged.kingOfTheHillEnabled).toBe(false);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("deck legality", () => {
  const pool = [
    being(2, 1, 1, "ENT-1"), being(1, 1, 1, "ENT-2"),
    { id: "BLE-1", type: "bless", power: 3 }, { id: "BLE-2", type: "bless", power: 2 },
  ];
  const rules = { deckSize: 4, maxCopies: 1, spellBudget: 4 };

  it("cPwr ignores a stale power value on a non-spell card", () => {
    expect(cPwr({ type: "equip", soul: 0, mind: 0, will: -4, power: 3 })).toBe(4);
    expect(cPwr({ type: "curse", power: 3 })).toBe(3);
  });

  it("flags spell budget and copy-limit breaches as errors", () => {
    expect(validateDeck({ cards: ["ENT-1", "ENT-2", "BLE-1", "BLE-2"] }, pool, rules).errors).toEqual(["spell power 5/4"]);
    expect(validateDeck({ cards: ["ENT-1", "ENT-1", "ENT-2", "BLE-1"] }, pool, rules).errors).toEqual(["1 card over 1 copy"]);
  });

  it("treats an undersized deck as a warning, not an error", () => {
    const v = validateDeck({ cards: ["ENT-1", "BLE-1"] }, pool, rules);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual(["2/4 cards"]);
    expect(validateDeck({ cards: ["ENT-1", "ENT-2", "BLE-1"] }, pool, { ...rules, deckSize: 3 })).toEqual({ errors: [], warnings: [] });
  });
});

describe("AI attack resolution", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  const setup = (atkCd, defCd) => {
    const s = baseState();
    s.bd[1][2] = cell(atkCd, "ai");
    s.bd[2][2] = cell(defCd, "player");
    return s;
  };
  const attack = { type: "ATTACK", fromRow: 1, fromCol: 2, toRow: 2, toCol: 2, stat: "soul" };

  it("a winning AI attack moves C toward the AI's side", () => {
    const fx = runOne(setup(being(3, 0, 0, "A"), being(1, 0, 0, "D")), attack);
    expect(fx.game.c).toBe(-2); // player is light, so the AI pulls C down
    expect(fx.game.bd[2][2]).toBeNull();
    expect(fx.pit.player.map(c => c.id)).toEqual(["D"]);
  });

  it("a losing AI attack moves C toward the defender, not the AI", () => {
    const fx = runOne(setup(being(1, 0, 0, "A"), being(4, 0, 0, "D")), attack);
    expect(fx.game.c).toBe(3);
    expect(fx.game.bd[1][2]).toBeNull();
    expect(fx.game.bd[2][2].cd.id).toBe("D");
    expect(fx.pit.ai.map(c => c.id)).toEqual(["A"]);
  });

  it("a tie destroys both beings and leaves C alone, for executor and planner alike", () => {
    const s = setup(being(2, 0, 0, "A"), being(-2, 0, 0, "D"));
    const fx = runOne(s, attack);
    expect(fx.game.c).toBe(0);
    expect(fx.game.bd[1][2]).toBeNull();
    expect(fx.game.bd[2][2]).toBeNull();
    expect(fx.pit).toEqual({ player: [s.bd[2][2].cd], ai: [s.bd[1][2].cd] });

    const planned = aiClone(s);
    aiApply(planned, { ...attack, res: { winner: "tie", dmg: 0 } }, { C_MAX: 10 });
    expect(planned.bd[1][2]).toBeNull();
    expect(planned.bd[2][2]).toBeNull();
  });
});

describe("optional attack limits (off by default)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  const duel = () => {
    const s = baseState();
    s.bd[1][2] = cell(being(4, 0, 0, "A"), "ai");
    s.bd[2][2] = cell(being(0, 1, 1, "D"), "player");
    return s;
  };
  const attack = { type: "ATTACK", fromRow: 1, fromCol: 2, toRow: 2, toCol: 2, stat: "soul" };

  it("combatCap bounds how far one combat moves C, in the executor and the planner", () => {
    const fx = mkFx(); fx.COMBAT_CAP = 3; fx.aiPlanRef.current = [null, attack];
    runAI(duel(), 1, fx);
    expect(fx.game.c).toBe(-3); // a 4-point win, capped at 3
    expect(fx.game.bd[2][2]).toBeNull();
    const planned = aiClone(duel());
    aiApply(planned, { ...attack, res: { winner: "attacker", dmg: 4 } }, { C_MAX: 10, COMBAT_CAP: 3 });
    expect(planned.c).toBe(-3);
    expect(runOne(duel(), attack).game.c).toBe(-4); // uncapped when the setting is 0/absent
  });

  it("attacksPerBeing stops a being attacking again until its owner's next turn", () => {
    const cfg = { C_MAX: 10, ATTACKS_PER_BEING: 1 };
    const s = duel();
    s.bd[1][3] = cell(being(0, 1, 1, "D2"), "player");
    expect(aiActions(s, cfg).some(a => a.type === "ATTACK")).toBe(true);
    aiApply(s, { ...attack, res: { winner: "attacker", dmg: 4 } }, cfg);
    expect(s.bd[1][2].atk).toBe(1);
    expect(aiActions(s, cfg).some(a => a.type === "ATTACK")).toBe(false);
    flipSets(s, "ai"); // start of the AI's next turn
    expect(aiActions(s, cfg).some(a => a.type === "ATTACK")).toBe(true);
  });
});

describe("cards leaving the board go to a pit", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("moving onto your own set trap discards it instead of overwriting it", () => {
    const fx = mkFx();
    const g = baseState();
    const trap = { id: "BLE-1", type: "bless", power: 2 };
    g.bd[3][2] = { cd: trap, ow: "player", fd: true, prm: 1 };
    const consumed = chkTraps(g, 3, 2, "player", cell(being(1, 1, 1), "player"), false, fx);
    expect(consumed).toBe(false);
    expect(g.bd[3][2]).toBeNull();
    expect(fx.pit.player).toEqual([trap]);
    expect(g.c).toBe(0); // discarded, not triggered
  });

  it("an AI purge-summon sends the purged card to its owner's pit", () => {
    const s = baseState();
    const field = { id: "TER-1", type: "field", soul: 1, mind: 0, will: 0 };
    const voidBeing = being(0, 0, 0, "V");
    s.bd[3][3] = cell(field, "player");
    s.aH = [voidBeing];
    const fx = runOne(s, { type: "SUMMON", card: voidBeing, row: 3, col: 3 });
    expect(fx.pit.player).toEqual([field]);
    expect(fx.game.aH).toEqual([]);
  });
});
