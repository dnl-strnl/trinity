import { STAT_MAX, DEFAULT_GRADS as DG } from "./theme.js";
import { shuffle, cPwr, isTranscendent, computeStartCounters, TYPE_PREFIX, CAMPAIGN_SET_IDS } from "./gameUtils.js";

export function mkRNG(seed) {
  let s = (seed || 42) & 0x7fffffff || 1;
  return () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 2147483647; };
}

export function genCardsForParams({ name, total, powerMin, powerMax,
  pctEntity, pctBless, pctCurse, pctTerrain, pctItem,
  blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
  equipPwrMin = 1, equipPwrMax = 3, terrPwrMin = 1, terrPwrMax = 3,
  rarCommon, rarUncommon, rarRare, rarLegendary,
  ensureTypes, images = {}, mode = "random", ts: tsIn, counters = {}, rng: rngIn = null }) {
  const rng = rngIn || Math.random;
  const ts = tsIn !== undefined ? tsIn : Date.now();
  const newCards = [];

  function allPerms(pMin, pMax) {
    const p = [];
    for (let s = -STAT_MAX; s <= STAT_MAX; s++) for (let m = -STAT_MAX; m <= STAT_MAX; m++) for (let w = -STAT_MAX; w <= STAT_MAX; w++) { if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= pMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= pMax) p.push({ soul: s, mind: m, will: w }); }
    return p;
  }
  function randStats(pMin, pMax) {
    for (let a = 0; a < 100; a++) {
      const s = Math.floor(rng() * (STAT_MAX * 2 + 1)) - STAT_MAX, m = Math.floor(rng() * (STAT_MAX * 2 + 1)) - STAT_MAX, w = Math.floor(rng() * (STAT_MAX * 2 + 1)) - STAT_MAX;
      if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= pMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= pMax) return { soul: s, mind: m, will: w };
    } return { soul: 1, mind: 1, will: 0 };
  }

  function gradFor(type, o) {
    const h = type === "bless" ? 210 : type === "curse" ? 350 : type === "field" ? 80 : type === "equip" ? 30 : o > 0 ? 40 : o < 0 ? 280 : 170;
    const sat = type === "being" ? 20 : 15, b = 18 + Math.floor(rng() * 22);
    return [`hsl(${h},${sat + Math.floor(rng() * 10)}%,${b}%)`, `hsl(${h},${sat}%,${Math.floor(b / 2)}%)`];
  }
  function rPwr(min, max) { return min + Math.floor(rng() * (max - min + 1)); }
  function nextCardId(type) {
    if (!counters[type]) counters[type] = 1;
    return `${TYPE_PREFIX[type] || "GEN"}-${String(counters[type]++).padStart(5, "0")}`;
  }

  const counts = {
    being: Math.round(total * pctEntity / 100), bless: Math.round(total * pctBless / 100),
    curse: Math.round(total * pctCurse / 100), field: Math.round(total * pctTerrain / 100), equip: Math.round(total * pctItem / 100)
  };
  counts.being += total - Object.values(counts).reduce((a, b) => a + b, 0);
  const perms = mode === "permute" ? shuffle([...allPerms(powerMin, powerMax)]) : null;
  let pIdx = 0;

  for (const [type, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      let stats, pwr;
      if (type === "being") { stats = perms ? perms[pIdx++ % perms.length] : randStats(powerMin, powerMax); }
      else if (type === "bless") { stats = { soul: 0, mind: 0, will: 0 }; pwr = rPwr(blessPwrMin, blessPwrMax); }
      else if (type === "curse") { stats = { soul: 0, mind: 0, will: 0 }; pwr = rPwr(cursePwrMin, cursePwrMax); }
      else if (type === "field") { stats = randStats(terrPwrMin, terrPwrMax); }
      else { stats = randStats(equipPwrMin, equipPwrMax); }
      const card = {
        id: nextCardId(type), name: "", type, ...stats,
        rarity: "common", set: name, weight: 100, image: null
      };
      if (pwr) card.power = pwr;
      newCards.push(card);
    }
  }

  // Distribute rarity — type-diverse, polarity-balanced legendaries
  const getP = c => c.power || (Math.abs(c.soul) + Math.abs(c.mind) + Math.abs(c.will));
  newCards.sort((a, b) => getP(b) - getP(a));
  const totalW = rarCommon + rarUncommon + rarRare + rarLegendary;
  const assignedIds = new Set();
  ["legendary", "rare", "uncommon"].forEach(rar => {
    const rarW = rar === "legendary" ? rarLegendary : rar === "rare" ? rarRare : rarUncommon;
    const targetCount = Math.round(total * rarW / totalW);
    let rarAssigned = 0;
    if (ensureTypes) {
      for (const t of ["being", "bless", "curse", "field", "equip"]) {
        if (rarAssigned >= targetCount) break;
        const card = newCards.find(c => !assignedIds.has(c.id) && c.type === t);
        if (card) { card.rarity = rar; assignedIds.add(card.id); rarAssigned++; }
      }
    }
    if (rar === "legendary") {
      const pols = ["light", "dark", "balanced"]; let polIdx = 0;
      for (const card of newCards) {
        if (rarAssigned >= targetCount || assignedIds.has(card.id) || card.type !== "being") continue;
        const au = card.soul + card.mind + card.will;
        const tgt = pols[polIdx % 3];
        if ((tgt === "light" && au > 0) || (tgt === "dark" && au < 0) || (tgt === "balanced" && au === 0)) {
          card.rarity = "legendary"; assignedIds.add(card.id); rarAssigned++; polIdx++;
        }
      }
    }
    for (const card of newCards) {
      if (rarAssigned >= targetCount || assignedIds.has(card.id)) continue;
      card.rarity = rar; assignedIds.add(card.id); rarAssigned++;
    }
  });
  newCards.forEach(card => { if (!assignedIds.has(card.id)) card.rarity = "common"; });

  // Assign images/gradients
  newCards.forEach((card, ci) => {
    if (images[ci]) { card.image = images[ci]; }
    else { card.gradient = card.type === "being" ? gradFor(card.type, card.soul + card.mind + card.will) : DG[card.type] || DG.being; }
  });
  return newCards;
}

// ═══ SET GENERATOR ═══
// Returns { newCards, setEntry } — caller applies to state
export function generateSetCards(gen, genImages, genMode, genSeed, cardPool) {
  const ts = Date.now();
  const counters = computeStartCounters(cardPool);
  const newCards = genCardsForParams({ ...gen, images: genImages, mode: genMode, ts, counters, rng: mkRNG(genSeed) });
  const setEntry = { id: "gen_" + ts, name: gen.name, color: gen.color, cardIds: newCards.map(c => c.id) };
  return { newCards, setEntry };
}

// ═══ CAMPAIGN GENERATOR ═══
// Returns { allNewCards, allSets, oldCardIds } — caller applies to state
export function generateCampaignCards(camGen, camSeed, cardPool, sets, campaignSetIds) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const n = campaignSetIds.length;
  const ts = Date.now();
  const camRng = mkRNG(camSeed);
  const allNewCards = [];
  const setCardMap = {};
  const counters = computeStartCounters(cardPool);
  // Compute per-set card counts
  const total = camGen.cardsPerSet * n;
  let setCounts;
  if (camGen.distMode === "bell") {
    const center = (n - 1) / 2;
    const sigma = Math.max(0.5, (n / 2) * (camGen.bellSpread / 100));
    const weights = Array.from({ length: n }, (_, i) => Math.exp(-0.5 * ((i - center) / sigma) ** 2));
    const sumW = weights.reduce((a, b) => a + b, 0);
    setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
    const diff = total - setCounts.reduce((a, b) => a + b, 0);
    setCounts[Math.floor(n / 2)] = Math.max(1, setCounts[Math.floor(n / 2)] + diff);
  } else if (camGen.distMode === "ramp") {
    const weights = Array.from({ length: n }, (_, i) => i + 1);
    const sumW = weights.reduce((a, b) => a + b, 0);
    setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
    const diff = total - setCounts.reduce((a, b) => a + b, 0);
    setCounts[n - 1] = Math.max(1, setCounts[n - 1] + diff);
  } else if (camGen.distMode === "ramp_inv") {
    const weights = Array.from({ length: n }, (_, i) => n - i);
    const sumW = weights.reduce((a, b) => a + b, 0);
    setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
    const diff = total - setCounts.reduce((a, b) => a + b, 0);
    setCounts[0] = Math.max(1, setCounts[0] + diff);
  } else {
    setCounts = Array(n).fill(camGen.cardsPerSet);
  }

  const setName = id => id === "core" ? "A" : id.replace("set_", "").toUpperCase();
  campaignSetIds.forEach((setId, si) => {
    const t = si / (n - 1);
    const setObj = sets.find(s => s.id === setId) || { id: setId, name: setName(setId), color: "#303030", cardIds: [] };
    const powerMin = Math.round(lerp(camGen.startPowerMin, camGen.endPowerMin, t));
    const powerMax = Math.max(powerMin, Math.round(lerp(camGen.startPowerMax, camGen.endPowerMax, t)));
    const blessPwrMin = Math.round(lerp(camGen.startBlessPwrMin, camGen.endBlessPwrMin, t));
    const blessPwrMax = Math.max(blessPwrMin, Math.round(lerp(camGen.startBlessPwrMax, camGen.endBlessPwrMax, t)));
    const cursePwrMin = Math.round(lerp(camGen.startCursePwrMin, camGen.endCursePwrMin, t));
    const cursePwrMax = Math.max(cursePwrMin, Math.round(lerp(camGen.startCursePwrMax, camGen.endCursePwrMax, t)));
    const equipPwrMin = Math.round(lerp(camGen.startEquipPwrMin, camGen.endEquipPwrMin, t));
    const equipPwrMax = Math.max(equipPwrMin, Math.round(lerp(camGen.startEquipPwrMax, camGen.endEquipPwrMax, t)));
    const terrPwrMin = Math.round(lerp(camGen.startTerrPwrMin, camGen.endTerrPwrMin, t));
    const terrPwrMax = Math.max(terrPwrMin, Math.round(lerp(camGen.startTerrPwrMax, camGen.endTerrPwrMax, t)));
    const rarCommon = Math.round(lerp(camGen.startRarCommon, camGen.endRarCommon, t));
    const rarUncommon = Math.round(lerp(camGen.startRarUncommon, camGen.endRarUncommon, t));
    const rarRare = Math.round(lerp(camGen.startRarRare, camGen.endRarRare, t));
    const rarLegendary = Math.round(lerp(camGen.startRarLegendary, camGen.endRarLegendary, t));
    const newCards = genCardsForParams({
      name: setObj.name, total: setCounts[si],
      powerMin, powerMax,
      pctEntity: camGen.pctEntity, pctBless: camGen.pctBless,
      pctCurse: camGen.pctCurse, pctTerrain: camGen.pctTerrain, pctItem: camGen.pctItem,
      blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
      equipPwrMin, equipPwrMax, terrPwrMin, terrPwrMax,
      rarCommon, rarUncommon, rarRare, rarLegendary,
      ensureTypes: camGen.ensureTypes, images: {}, mode: "random", ts: ts + si * 1000, counters, rng: camRng,
    });
    allNewCards.push(...newCards);
    setCardMap[setId] = newCards.map(c => c.id);
  });

  // Compute old card IDs to remove and full updated sets array
  const oldCardIds = new Set(campaignSetIds.flatMap(sid => sets.find(s => s.id === sid)?.cardIds || []));
  const existingIds = new Set(sets.map(s => s.id));
  const allSets = sets.map(s => campaignSetIds.includes(s.id) ? { ...s, cardIds: setCardMap[s.id] || [] } : s);
  campaignSetIds.forEach(sid => {
    if (!existingIds.has(sid)) allSets.push({ id: sid, name: setName(sid), color: "#303030", cardIds: setCardMap[sid] || [] });
  });

  return { allNewCards, allSets, oldCardIds };
}

// ═══ STRUCTURE DECK GENERATOR ═══
// Returns array of deck objects — caller applies to state
export function generateStructureDecks({ autoGenCfg, cardPool, existingDeckCount, maxCopies }) {
  const { count, deckSize, factionMode, artOnly } = autoGenCfg;
  const byType = t => cardPool.filter(c => c.type === t && (!artOnly || c.image));
  const allEnts   = byType("being");
  const blessings = byType("bless");
  const curses    = byType("curse");
  const equips    = byType("equip");
  const terrains  = byType("field");
  const transEnts  = allEnts.filter(isTranscendent);
  const normalEnts = allEnts.filter(c => !isTranscendent(c));

  // Bucket entities by dominant absolute stat for coverage
  const getBucket = c => {
    const s = Math.abs(c.soul || 0), m = Math.abs(c.mind || 0), w = Math.abs(c.will || 0);
    const max = Math.max(s, m, w);
    if (max === 0) return "other";
    if (s === max && s > m && s > w) return "soul";
    if (m === max && m > s && m > w) return "mind";
    if (w === max && w > s && w > m) return "will";
    return "other";
  };
  const buckets = { soul: [], mind: [], will: [], other: [] };
  for (const c of normalEnts) buckets[getBucket(c)].push(c);

  // Bell-curve power pick (median-centered) with maxCopies, tracking external copies
  function pick(pool, n, extCopies = {}) {
    if (!pool.length || n <= 0) return [];
    const powers = pool.map(c => cPwr(c)).sort((a, b) => a - b);
    const mid = powers[Math.floor(powers.length / 2)] || 2;
    const scored = pool
      .filter(c => (extCopies[c.id] || 0) < maxCopies)
      .map(c => ({ c, s: Math.exp(-((cPwr(c) - mid) ** 2) / (mid * 2 || 1)) + Math.random() * 0.45 }));
    scored.sort((a, b) => b.s - a.s);
    const result = [];
    for (let pass = 1; pass <= maxCopies; pass++) {
      for (const { c } of scored) {
        if (result.length >= n) break;
        const total = (extCopies[c.id] || 0) + result.filter(id => id === c.id).length;
        if (total === pass - 1) result.push(c.id);
      }
      if (result.length >= n) break;
    }
    return result.slice(0, n);
  }

  // Guaranteed anchors: best entity by each absolute stat across the entire pool
  const maxBy = (stat) => allEnts.reduce((best, c) => Math.abs(c[stat] || 0) > Math.abs(best?.[stat] || 0) ? c : best, null);
  const anchorCards = [...new Set([maxBy("soul"), maxBy("mind"), maxBy("will")].filter(Boolean))];

  // Pick entities ensuring ~equal coverage across soul/mind/will + 2-4 transcendents + 3 stat anchors
  function pickEntities(n) {
    const anchorIds = anchorCards.map(c => c.id);
    const transCount = Math.min(transEnts.length, Math.floor(Math.random() * 3) + 2);
    const transIds = [...transEnts].sort(() => Math.random() - 0.5).slice(0, transCount).map(c => c.id);
    const seeded = [...new Set([...anchorIds, ...transIds])];
    const copies = Object.fromEntries(seeded.map(id => [id, 1]));
    const result = [...seeded];
    let rem = n - result.length;
    if (rem <= 0) return result.slice(0, n);
    const perBucket = Math.floor(rem / 3);
    const extra = rem % 3;
    ["soul", "mind", "will"].forEach((key, i) => {
      const ids = pick(buckets[key], perBucket + (i < extra ? 1 : 0), copies);
      ids.forEach(id => { copies[id] = (copies[id] || 0) + 1; });
      result.push(...ids);
    });
    if (result.length < n) {
      const fallback = [...buckets.other, ...normalEnts];
      result.push(...pick(fallback, n - result.length, copies));
    }
    return result.slice(0, n);
  }

  // Pick equips synergistic with the entity stat distribution
  function pickEquips(n, entityIds) {
    if (!equips.length || n <= 0) return [];
    const entCards = entityIds.map(id => allEnts.find(c => c.id === id)).filter(Boolean);
    const statW = { soul: 0, mind: 0, will: 0 };
    for (const c of entCards) {
      const s = Math.abs(c.soul || 0), m = Math.abs(c.mind || 0), w = Math.abs(c.will || 0), t = s + m + w || 1;
      statW.soul += s / t; statW.mind += m / t; statW.will += w / t;
    }
    const scored = equips.map(c => ({
      c, s: statW.soul * Math.abs(c.soul || 0) + statW.mind * Math.abs(c.mind || 0)
            + statW.will * Math.abs(c.will || 0) + Math.random() * 1.5
    }));
    scored.sort((a, b) => b.s - a.s);
    const result = []; const copies = {};
    for (let pass = 1; pass <= maxCopies; pass++) {
      for (const { c } of scored) {
        if (result.length >= n) break;
        const total = (copies[c.id] || 0) + result.filter(id => id === c.id).length;
        if (total === pass - 1) { result.push(c.id); copies[c.id] = (copies[c.id] || 0) + 1; }
      }
      if (result.length >= n) break;
    }
    return result.slice(0, n);
  }

  // Strategy variations: [entPct, bcPct, equPct, oneCRatio (% of BC that are 1C free-draw)]
  const STRATEGIES = [
    [0.60, 0.20, 0.15, 0.35], // Balanced
    [0.65, 0.14, 0.16, 0.20], // Aggro  — more entities, fewer spells, fewer draws
    [0.50, 0.30, 0.15, 0.50], // Control — more spells, half are 1C for card advantage
    [0.55, 0.20, 0.20, 0.25], // Tempo  — equip-heavy for entity buffs
  ];

  const toRoman = n => { const v=[1000,900,500,400,100,90,50,40,10,9,5,4,1],s=["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"]; let r=""; v.forEach((val,i)=>{ while(n>=val){r+=s[i];n-=val;} }); return r; };

  const newDecks = [];
  for (let i = 0; i < count; i++) {
    const faction = count === 1
      ? (factionMode === "curse" ? "curse" : factionMode === "rand" ? (Math.random() < 0.5 ? "bless" : "curse") : "bless")
      : (i % 2 === 0 ? "bless" : "curse");
    const [entPct, bcPct, equPct, oneCRatio] = STRATEGIES[i % STRATEGIES.length];
    const vary = () => Math.floor(Math.random() * 5) - 2;
    const bcSlots   = Math.max(5, Math.round(deckSize * bcPct) + vary());
    const equSlots  = Math.max(3, Math.round(deckSize * equPct) + vary());
    const terrSlots = 2;
    const entSlots  = Math.max(4, deckSize - bcSlots - equSlots - terrSlots);

    const bcPool = faction === "bless" ? blessings : curses;
    const oneC   = bcPool.filter(c => cPwr(c) === 1);
    const highC  = bcPool.filter(c => cPwr(c) > 1);
    const oneCSlots  = Math.min(oneC.length * maxCopies, Math.round(bcSlots * oneCRatio));
    const highCSlots = bcSlots - oneCSlots;

    const entityIds = pickEntities(entSlots);
    const cards = [
      ...entityIds,
      ...pick(oneC, oneCSlots),
      ...pick(highC, highCSlots),
      ...pickEquips(equSlots, entityIds),
      ...pick(terrains, terrSlots),
    ];
    const name = toRoman(existingDeckCount + i + 1);
    newDecks.push({ name, cards });
  }
  return newDecks;
}
