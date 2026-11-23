#!/usr/bin/env node
/* global process */
// Headless AI-vs-AI harness on the live rulebook (src/rules.js + src/planner.js).
// Reads the real cards, decks and settings from backend/data and never writes to them.
//
//   node scripts/harness.js                         baseline, 400 games
//   node scripts/harness.js --games 2000 --seed 7   bigger seeded run
//   node scripts/harness.js --exp all               baseline + every preset experiment, side by side
//   node scripts/harness.js --exp e1,e2             selected presets (--no-baseline skips the baseline run)
//   node scripts/harness.js --variant '{"combatCap":3,"statCap":6}'
//   node scripts/harness.js --set presenceEnabled=false --set cMax=15
//   node scripts/harness.js --decks all             include decks that break the deck rules (default: legal only)
//   node scripts/harness.js --spell-budget 10       trim every deck's spells down to a budget first
//   node scripts/harness.js --mode balance --games 150 --json  per-deck table (what /api/simulate runs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkRNG } from "../src/cardGen.js";
import { mergeSettings, validateDeck, isSpell, cPwr } from "../src/gameUtils.js";
import { rulesCfg, newGame, legalActions, apply, endTurn, deckSide } from "../src/rules.js";
import { plan, settle } from "../src/planner.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "backend", "data");
const readJson = name => JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), "utf8"));

// The ten tuning experiments. Each is a rules variant plus optional settings/deck overrides.
export const EXPERIMENTS = {
  e1: { label: "1 attack per being + summoning sickness", variant: { attacksPerBeing: 1, summonSick: true } },
  e2: { label: "combat moves at most 3 C", variant: { combatCap: 3 } },
  e3: { label: "effective stats capped at ±6", variant: { statCap: 6 } },
  e3b: { label: "one equip per being", variant: { equipsPerBeing: 1 } },
  e4: { label: "spell budget 8 + one flip per turn", variant: { flipsPerTurn: 1 }, spellBudget: 8 },
  e5: { label: "first player takes 2 actions on turn 1", variant: { firstTurnActions: 2 } },
  e6: { label: "side decided by spells only", variant: { sideBySpells: true } },
  e7: { label: "tribute needed at total power 8+", variant: { tributeBy: "total" } },
  e8: { label: "one free mulligan", variant: { mulligan: true } },
  e9: { label: "a being that moved can't attack", variant: { movedCantAttack: true } },
  e10: { label: "king of the hill on, beings only", variant: { kothBeingsOnly: true }, settings: { kingOfTheHillEnabled: true } },
  koth: { label: "king of the hill on (as coded)", settings: { kingOfTheHillEnabled: true } },
  nopres: { label: "presence off", settings: { presenceEnabled: false } },
  zall: { label: "any zero crossing draws 2 (as the guide says)", variant: { zeroCrossDraw: "all" } },
  trap1: { label: "setting a trap costs an action (as the AI pays today)", variant: { trapSetCost: 1 } },
  e123: { label: "e1 + e2 + e3 together", variant: { attacksPerBeing: 1, summonSick: true, combatCap: 3, statCap: 6 } },
  e1a: { label: "1 attack per being (no summoning sickness)", variant: { attacksPerBeing: 1 } },
  e1b: { label: "summoning sickness only", variant: { summonSick: true } },
  e24: { label: "e2 + e4: combat cap 3, spell budget 8, one flip", variant: { combatCap: 3, flipsPerTurn: 1 }, spellBudget: 8 },
  wrap: { label: "zero-aura beings attack across board edges, all 8 directions", variant: { wrapAttack: "full" } },
  wraps: { label: "zero-aura beings attack across board edges, straight over only", variant: { wrapAttack: "straight" } },
  e26: { label: "e2 + e6: combat cap 3, side by spells", variant: { combatCap: 3, sideBySpells: true } },
};

function parseArgs(argv) {
  const o = { games: 400, seed: 1, decks: "legal", mode: "analyze", maxTurns: 200, json: false, cards: 0, exp: null, variant: {}, set: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--games") o.games = parseInt(next());
    else if (a === "--seed") o.seed = parseInt(next());
    else if (a === "--decks") o.decks = next();
    else if (a === "--mode") o.mode = next();
    else if (a === "--max-turns") o.maxTurns = parseInt(next());
    else if (a === "--json") o.json = true;
    else if (a === "--cards") o.cards = parseInt(next());
    else if (a === "--exp") o.exp = next();
    else if (a === "--no-baseline") o.noBaseline = true;
    else if (a === "--spell-budget") o.spellBudget = parseInt(next());
    else if (a === "--variant") o.variant = JSON.parse(next());
    else if (a === "--set") { const [k, v] = next().split("="); o.set[k] = v === "true" ? true : v === "false" ? false : Number(v); }
    else if (a === "--help" || a === "-h") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 12).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(0); }
    else { console.error(`unknown option ${a}`); process.exit(1); }
  }
  return o;
}

// Drop spells until a deck fits a smaller budget: the smallest spell that covers the excess, else the largest
function trimToBudget(cards, budget) {
  const out = [...cards];
  for (;;) {
    const spells = out.filter(isSpell), excess = spells.reduce((s, c) => s + cPwr(c), 0) - budget;
    if (excess <= 0) return out;
    const covering = spells.filter(c => cPwr(c) >= excess).sort((a, b) => cPwr(a) - cPwr(b))[0];
    out.splice(out.indexOf(covering || spells.sort((a, b) => cPwr(b) - cPwr(a))[0]), 1);
  }
}

const sig = a => [a.type, a.handIdx, (a.card || a.item)?.id, a.row, a.col, a.fromRow, a.fromCol, a.toRow, a.toCol, a.tribRow, a.tribCol, a.stat].join("|");

export function playGame(pCards, aCards, cfg, maxTurns = 200) {
  const s = newGame(pCards, aCards, cfg), first = s.turn;
  const m = {
    cBySrc: { combat: 0, spell: 0, trap: 0, presence: 0, center: 0 }, hits: [], maxTurnSwing: 0, leadChanges: 0,
    combats: { attacker: 0, defender: 0, tie: 0 }, zeroDraws: 0, desync: 0, recycles: 0,
    traps: { set: 0, flipped: 0 }, wrapHits: 0, wrapC: 0,
    seen: { player: new Set(s.pH.map(c => c.id)), ai: new Set(s.aH.map(c => c.id)) },
  };
  let lastSign = 0;
  while (s.ph === "playing" && s.tn <= maxTurns) {
    const c0 = s.c, ev = [], pitBefore = s.pit.player.length + s.pit.ai.length;
    // The planner cannot see hidden cards. A step that reveals one (a draw, a step onto a
    // face-down card) is followed by a fresh plan, and so is a step that turns out not to be legal.
    for (let replans = 0, seq = plan(s, cfg), i = 0; i < seq.length && s.ph === "playing"; i++) {
      const a = settle(s, seq[i]), want = sig(a);
      if (legalActions(s, cfg).some(l => sig(l) === want)) {
        const t = a.type;
        if (t === "SET_TRAP" || t === "TERRAIN") m.traps.set++; else if (t === "FLIP_TRAP" || t === "FLIP_FIELD") m.traps.flipped++;
        apply(s, a, cfg, ev);
        if (a.reveals && s.ph === "playing") { seq = plan(s, cfg); i = -1; }
        continue;
      }
      m.desync++;
      if (++replans > 2) break;
      seq = plan(s, cfg); i = -1;
    }
    if (s.ph === "playing") endTurn(s, cfg, ev);
    for (const e of ev) {
      if (e.t === "c") { m.cBySrc[e.src] += Math.abs(e.amt); if (e.src === "combat") m.hits.push(Math.abs(e.amt)); }
      else if (e.t === "combat") { m.combats[e.winner]++; if (e.wrap) { m.wrapHits++; if (e.winner === "attacker") m.wrapC += e.dmg; } }
      else if (e.t === "zeroDraw") m.zeroDraws++;
      else if (e.t === "stepOn") m.traps[e.kind] = (m.traps[e.kind] || 0) + 1;
    }
    if (s.pit.player.length + s.pit.ai.length < pitBefore) m.recycles++;
    m.maxTurnSwing = Math.max(m.maxTurnSwing, Math.abs(s.c - c0));
    const sign = Math.sign(s.c);
    if (sign && lastSign && sign !== lastSign) m.leadChanges++;
    if (sign) lastSign = sign;
    for (const c of s.pH) m.seen.player.add(c.id);
    for (const c of s.aH) m.seen.ai.add(c.id);
  }
  return { winner: s.win, first, turns: s.tn, finalC: s.c, timedOut: s.ph === "playing", pRole: s.pRole, ...m };
}

const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const quant = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
// 95% interval half-width for a proportion, in percentage points
const ci = (n, d) => d ? Math.round(1000 * 1.96 * Math.sqrt((n / d) * (1 - n / d) / d)) / 10 : 0;

// The game as currently configured: real card pool, live settings (optional overrides), seeded RNG
export function liveSetup({ seed = 1, variant = {}, settingsOver = {} } = {}) {
  const cards = readJson("cards"), byId = new Map(cards.map(c => [c.id, c]));
  const settings = { ...mergeSettings(readJson("settings")), ...settingsOver };
  // The optional limits in Settings are rule variants here
  const live = {};
  if (settings.combatCap > 0) live.combatCap = settings.combatCap;
  if (settings.turnCap > 0) live.turnCap = settings.turnCap;
  if (settings.attacksPerBeing > 0) live.attacksPerBeing = settings.attacksPerBeing;
  if (settings.edgeWrap === "full" || settings.edgeWrap === "straight") live.wrapAttack = settings.edgeWrap;
  const cfg = rulesCfg({
    C_MAX: settings.cMax, HAND_SIZE: settings.handSize, actionsPerTurn: settings.actionsPerTurn,
    BEING_SET_ENABLED: settings.beingSetEnabled, TRIBUTE_SUMMON_ENABLED: settings.tributeSummonEnabled,
    PRESENCE_ENABLED: settings.presenceEnabled, KOTH_ENABLED: settings.kingOfTheHillEnabled,
    rng: mkRNG(seed), variant: { ...live, ...variant },
  });
  const rules = { deckSize: settings.deckSize, maxCopies: settings.maxCopies, spellBudget: settings.spellBudget };
  return { cards, byId, settings, cfg, rules };
}

// One full run: every light-vs-dark pairing of the chosen decks, seats assigned at random.
export function run({ games, seed, deckFilter, maxTurns, variant, settingsOver, spellBudget }) {
  const { cards, byId, cfg, rules } = liveSetup({ seed, variant, settingsOver });
  let decks = readJson("decks").map(d => ({ name: d.name, legal: !validateDeck(d, cards, rules).errors.length, cards: d.cards.map(id => byId.get(id)).filter(Boolean) }));
  if (deckFilter === "legal") decks = decks.filter(d => d.legal);
  if (spellBudget != null) decks = decks.map(d => ({ ...d, cards: trimToBudget(d.cards, spellBudget) }));
  for (const d of decks) d.side = deckSide(d.cards, cfg);
  const pairings = [];
  for (const l of decks) for (const d of decks) if (l.side === "light" && d.side === "dark") pairings.push([l, d]);
  if (!pairings.length) throw new Error("no light-vs-dark pairing among the selected decks");
  const total = games;

  const t0 = Date.now(), res = [];
  const deckStat = new Map(decks.map(d => [d.name, { name: d.name, side: d.side, wins: 0, losses: 0, draws: 0 }]));
  const pairStat = new Map(pairings.map(([l, d]) => [`${l.name}|${d.name}`, { light: l.name, dark: d.name, lightWins: 0, darkWins: 0 }]));
  const cardStat = new Map();
  for (let g = 0; g < total; g++) {
    const [light, dark] = pairings[g % pairings.length];
    const lightIsPlayer = cfg.rng() < 0.5;
    const r = playGame(lightIsPlayer ? light.cards : dark.cards, lightIsPlayer ? dark.cards : light.cards, cfg, maxTurns);
    const lightSeat = lightIsPlayer ? "player" : "ai";
    r.lightWon = r.winner ? r.winner === lightSeat : null;
    res.push(r);
    const ls = deckStat.get(light.name), ds = deckStat.get(dark.name);
    if (r.lightWon !== null) pairStat.get(`${light.name}|${dark.name}`)[r.lightWon ? "lightWins" : "darkWins"]++;
    if (r.lightWon === null) { ls.draws++; ds.draws++; } else if (r.lightWon) { ls.wins++; ds.losses++; } else { ds.wins++; ls.losses++; }
    if (r.winner) for (const seat of ["player", "ai"]) for (const id of r.seen[seat]) {
      const cs = cardStat.get(id) || { id, seen: 0, won: 0 }; cs.seen++; if (r.winner === seat) cs.won++; cardStat.set(id, cs);
    }
  }

  const dec = res.filter(r => r.winner), turns = res.map(r => r.turns).sort((a, b) => a - b);
  const hits = res.flatMap(r => r.hits), cTot = res.reduce((s, r) => s + Object.values(r.cBySrc).reduce((a, b) => a + b, 0), 0);
  const firstWins = dec.filter(r => r.winner === r.first).length;
  const atk = res.reduce((s, r) => s + r.combats.attacker, 0), fights = res.reduce((s, r) => s + r.combats.attacker + r.combats.defender + r.combats.tie, 0);
  const summary = {
    games: total, pairings: pairings.length, decks: decks.length, seed, elapsed: Math.round((Date.now() - t0) / 100) / 10,
    timeouts: res.length - dec.length, desyncs: res.reduce((s, r) => s + r.desync, 0),
    turns: { mean: Math.round(mean(turns) * 10) / 10, median: quant(turns, 0.5), p10: quant(turns, 0.1), p90: quant(turns, 0.9), min: turns[0], max: turns[turns.length - 1] },
    endBy7: pct(res.filter(r => r.turns <= 7).length, total),
    firstPlayerWin: pct(firstWins, dec.length), firstPlayerCi: ci(firstWins, dec.length),
    lightWin: pct(dec.filter(r => r.lightWon).length, dec.length),
    playerSeatWin: pct(dec.filter(r => r.winner === "player").length, dec.length),
    cShare: Object.fromEntries(Object.keys(res[0].cBySrc).map(k => [k, pct(res.reduce((s, r) => s + r.cBySrc[k], 0), cTot)])),
    hit: { mean: Math.round(mean(hits) * 100) / 100, ge4: pct(hits.filter(h => h >= 4).length, hits.length), ge6: pct(hits.filter(h => h >= 6).length, hits.length), max: hits.length ? Math.max(...hits) : 0, perGame: Math.round(hits.length / total * 10) / 10 },
    turnSwing: { mean: Math.round(mean(res.map(r => r.maxTurnSwing)) * 10) / 10, ge5: pct(res.filter(r => r.maxTurnSwing >= 5).length, total), ge7: pct(res.filter(r => r.maxTurnSwing >= 7).length, total) },
    leadChanges: { mean: Math.round(mean(res.map(r => r.leadChanges)) * 100) / 100, wireToWire: pct(res.filter(r => r.leadChanges === 0).length, total) },
    attacksWon: pct(atk, fights),
    wrap: { perGame: Math.round(100 * res.reduce((s, r) => s + r.wrapHits, 0) / total) / 100, games: pct(res.filter(r => r.wrapHits > 0).length, total), cPerGame: Math.round(100 * res.reduce((s, r) => s + r.wrapC, 0) / total) / 100, ofFights: pct(res.reduce((s, r) => s + r.wrapHits, 0), fights) },
    recycles: pct(res.filter(r => r.recycles > 0).length, total),
    // Per game: set spells/fields put down, flipped by their owner, and stepped on by an enemy (by outcome)
    traps: Object.fromEntries([...new Set(res.flatMap(r => Object.keys(r.traps)))].sort().map(k => [k, Math.round(100 * res.reduce((s, r) => s + (r.traps[k] || 0), 0) / total) / 100])),
    deckTable: [...deckStat.values()].map(d => ({ ...d, score: pct(d.wins + 0.5 * d.draws, d.wins + d.losses + d.draws) })).sort((a, b) => b.score - a.score),
    pairTable: [...pairStat.values()],
    cardTable: [...cardStat.values()].map(c => ({ ...c, card: byId.get(c.id), winRate: pct(c.won, c.seen) })),
  };
  return summary;
}

function printSummary(label, s, nCards) {
  const L = (k, v) => console.log(`  ${k.padEnd(34)}${v}`);
  console.log(`\n${label}`);
  L("games / pairings / decks", `${s.games} / ${s.pairings} / ${s.decks}   (seed ${s.seed}, ${s.elapsed}s)`);
  L("turns: median (p10–p90), mean", `${s.turns.median} (${s.turns.p10}–${s.turns.p90}), ${s.turns.mean}   range ${s.turns.min}–${s.turns.max}`);
  L("games over within 7 turns", `${s.endBy7}%`);
  L("first player wins", `${s.firstPlayerWin}% ±${s.firstPlayerCi}`);
  L("light side wins", `${s.lightWin}%`);
  L("player-seat wins (should be ~50)", `${s.playerSeatWin}%`);
  L("C moved by", Object.entries(s.cShare).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}%`).join(", "));
  L("combat hit: mean, ≥4, ≥6, max", `${s.hit.mean}, ${s.hit.ge4}%, ${s.hit.ge6}%, ${s.hit.max}   (${s.hit.perGame} hits/game)`);
  L("biggest one-turn swing: mean", `${s.turnSwing.mean}   (≥5 in ${s.turnSwing.ge5}% of games, ≥7 in ${s.turnSwing.ge7}%)`);
  L("lead changes: mean, wire-to-wire", `${s.leadChanges.mean}, ${s.leadChanges.wireToWire}%`);
  L("attacks won by attacker", `${s.attacksWon}%`);
  if (s.wrap.perGame) L("attacks across an edge", `${s.wrap.perGame}/game (${s.wrap.ofFights}% of fights), in ${s.wrap.games}% of games, ${s.wrap.cPerGame} C/game won`);
  L("games with a pit reshuffle", `${s.recycles}%`);
  L("traps per game", Object.entries(s.traps).map(([k, v]) => `${k} ${v}`).join(", "));
  L("timeouts / plan desyncs", `${s.timeouts} / ${s.desyncs}`);
  console.log("  deck win rates:");
  for (const d of s.deckTable) console.log(`    ${d.name.padEnd(22)}${d.side.padEnd(6)}${String(d.score).padStart(5)}%   ${d.wins}-${d.losses}${d.draws ? `-${d.draws}` : ""}`);
  console.log("  pairings (light vs dark, light's wins–losses):");
  for (const p of s.pairTable) console.log(`    ${p.light.padEnd(22)}vs ${p.dark.padEnd(22)}${p.lightWins}-${p.darkWins}`);
  if (nCards) {
    const stat = c => c.type === "bless" || c.type === "curse" ? `${c.type} ${c.power}` : `${c.type} ${c.soul}/${c.mind}/${c.will}`;
    const rows = s.cardTable.filter(c => c.seen >= 30).sort((a, b) => b.winRate - a.winRate);
    const show = c => console.log(`    ${c.id.padEnd(18)}${stat(c.card).padEnd(18)}${String(c.winRate).padStart(5)}%   seen ${c.seen}`);
    console.log(`  cards: win rate of the side that drew them (seen in 30+ games) — top ${nCards}`);
    rows.slice(0, nCards).forEach(show);
    console.log(`  bottom ${nCards}`);
    rows.slice(-nCards).forEach(show);
  }
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const base = { games: o.games, seed: o.seed, deckFilter: o.decks, maxTurns: o.maxTurns, variant: o.variant, settingsOver: o.set, spellBudget: o.spellBudget };

  if (o.mode === "balance") {
    // Same shape scripts/simulate.js --mode balance used to print, for /api/simulate
    const s = run(base);
    const results = s.deckTable.map(({ name, wins, losses, draws, score }) => ({ name, wins, losses, draws, score }));
    if (o.json) console.log(JSON.stringify({ results, elapsed: s.elapsed }));
    else printSummary("Balance", s, o.cards);
    return;
  }

  const names = !o.exp ? [] : o.exp === "all" ? Object.keys(EXPERIMENTS) : o.exp.split(",");
  for (const n of names) if (!EXPERIMENTS[n]) { console.error(`unknown experiment ${n} — have: ${Object.keys(EXPERIMENTS).join(", ")}`); process.exit(1); }
  const runs = o.noBaseline && names.length ? [] : [["baseline", "rules as played today", run(base)]];
  for (const n of names) {
    const e = EXPERIMENTS[n];
    runs.push([n, e.label, run({ ...base, variant: { ...o.variant, ...e.variant }, settingsOver: { ...o.set, ...e.settings }, spellBudget: e.spellBudget })]);
  }
  if (o.json) { console.log(JSON.stringify(runs.map(([name, label, s]) => ({ name, label, ...s, cardTable: undefined })))); return; }
  for (const [name, label, s] of runs) printSummary(`${name} — ${label}`, s, o.cards);
  if (runs.length > 1) {
    console.log("\ncomparison");
    console.log(`  ${"".padEnd(9)}${"turns".padStart(6)}${"≤7t%".padStart(7)}${"1st%".padStart(7)}${"light%".padStart(8)}${"hit".padStart(6)}${"≥4%".padStart(6)}${"swing".padStart(7)}${"≥7%".padStart(6)}${"leads".padStart(7)}${"spread".padStart(8)}  label`);
    for (const [name, label, s] of runs) {
      const spread = Math.round((s.deckTable[0].score - s.deckTable[s.deckTable.length - 1].score) * 10) / 10;
      console.log(`  ${name.padEnd(9)}${String(s.turns.median).padStart(6)}${String(s.endBy7).padStart(7)}${String(s.firstPlayerWin).padStart(7)}${String(s.lightWin).padStart(8)}${String(s.hit.mean).padStart(6)}${String(s.hit.ge4).padStart(6)}${String(s.turnSwing.mean).padStart(7)}${String(s.turnSwing.ge7).padStart(6)}${String(s.leadChanges.mean).padStart(7)}${String(spread).padStart(8)}  ${label}`);
    }
    console.log("  turns = median turns · ≤7t = games over within 7 turns · 1st = first-player win rate · hit = mean C per winning attack");
    console.log("  swing = mean biggest one-turn C swing · leads = mean lead changes · spread = best minus worst deck win rate");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
