import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  FONT_TITLE, FONT_UI, FONT_BODY, THEME as T, TYPE_COLORS as TC,
  DEFAULT_GRADS as DG, RARITY_COLORS as RC, RARITY_ORDER as RO,
  STAT_DEFS, STAT_MIN, STAT_MAX, B, LBL, INP,
} from "./theme.js";
import {
  aura, shuffle, gc, getDeckMagnitude, adj, adjFull, attackCells, isWrapAttack,
  isTranscendent, isVoid, canReach, hasAdjOccupied,
  hasAdjSetOrField, countAdjFaceUpFields, getEff, cPwr,
  resolveCombat, flipSets, validateDeck,
  JP, JP_TYPES, JP_STATS, TYPE_PREFIX, CAMPAIGN_SET_IDS, DEFAULT_SETTINGS, ACTION_TYPES, PACES,
} from "./gameUtils.js";
import { Card, Flash, CDisp } from "./components.jsx";
import { generateSetCards, generateCampaignCards, generateStructureDecks as genStructureDecks } from "./cardGen.js";
import {
  toPit as engineToPit, reshufflePit as engineReshufflePit, combatC as engineCombatC,
  applyC as engineApplyC, chkTraps as engineChkTraps, checkFieldFreeings as engineCheckFieldFreeings,
  chkPresence as engineChkPresence, chkCenter as engineChkCenter, runAI as engineRunAI, placeDelay,
} from "./engine.js";
import { playSound } from "./sfx.js";
import { useGameSync } from "./hooks/useGameSync.js";
import { usePersistence, uploadFile } from "./hooks/usePersistence.js";
import SettingsModal from "./tabs/SettingsModal.jsx";
import EditorTab from "./tabs/EditorTab.jsx";
import PacksTab from "./tabs/PacksTab.jsx";
import CodexTab from "./tabs/CodexTab.jsx";
import DecksTab from "./tabs/DecksTab.jsx";
import ForgeTab from "./tabs/ForgeTab.jsx";
import TitleScreen from "./TitleScreen.jsx";
import MusicPlayer from "./MusicPlayer.jsx";
import { parseYouTubeIds } from "./music.js";
import PlayLobby from "./tabs/PlayLobby.jsx";
import DuelLobby from "./tabs/DuelLobby.jsx";
import DuelBoard from "./tabs/DuelBoard.jsx";
import RulesTab from "./tabs/RulesTab.jsx";
import { DEV, tabLive } from "./release.js";

// Until Packs is live there is nothing to collect, so deck builders get the whole card pool.
const FREE_POOL = !tabLive("packs");

export default function Trinity() {
  const [tab, setTab] = useState("play");
  const [cardPool, setCardPoolRaw] = useState([]);
  const setCardPool = useCallback((val) => {
    setCardPoolRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      const seen = new Set();
      return next.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
    });
  }, []);
  const [coll, setColl] = useState({});
  const [decks, setDecks] = useState([]);
  const [selDI, setSelDI] = useState(0); const [oppDI, setOppDI] = useState(1);
  const [sets, setSets] = useState([]);
  const [dbR, setDbR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Live settings values, destructured to the engine's conventional constant names
  const { cMax: C_MAX, handSize: HAND_SIZE, actionsPerTurn, deckSize: DECK_SIZE, maxCopies: MAX_COPIES, spellBudget, tokensStart: TOKENS_START, tokensPerWin: TOKENS_PER_WIN, packCost: PACK_COST, cardsPerPack: CARDS_PER_PACK, tributeSummonEnabled: TRIBUTE_SUMMON_ENABLED, beingSetEnabled: BEING_SET_ENABLED, presenceEnabled: PRESENCE_ENABLED, combatCap: COMBAT_CAP, turnCap: TURN_CAP, attacksPerBeing: ATTACKS_PER_BEING, edgeWrap: EDGE_WRAP, locale, slamAnim, cinemaMode, cinemaSwap } = settings;
  const jp = locale === "jp";
  const t = s => jp ? (JP[s] ?? s) : s;
  const [tokens, setTokens] = useState(TOKENS_START);
  const [tokenFlash, setTokenFlash] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [musicTitle, setMusicTitle] = useState("");
  // Music is a local-dev feature: the committed music-links.txt is the default list, and the import (with the
  // whole branch) is compiled out of production builds. A non-empty Settings → Music list overrides the file.
  const [localMusicLinks, setLocalMusicLinks] = useState("");
  useEffect(() => { if (DEV) import("../music-links.txt?raw").then(m => setLocalMusicLinks(m.default), () => {}); }, []);
  const musicLinks = settings.musicLinks.trim() ? settings.musicLinks : localMusicLinks;
  const hasMusic = parseYouTubeIds(musicLinks).length > 0;

  // ═══ MULTIPLAYER STATE ═══
  const [mMode, setMMode] = useState(false);
  const [mRole, setMRole] = useState(null); // "player", "ai", or "spectator"
  const [mAlias, setMAlias] = useState(null);     // my chosen emoji identifier
  const [mOppAlias, setMOppAlias] = useState(null); // opponent's emoji
  // Audit trail: { type, seq, ts, remote?, role?, c, tn, ...payload }. The ref is the source of truth so
  // the end-of-game save (fired from a stale closure) always sees every action, including the last one.
  const [, setActionLogState] = useState([]);
  const actionTrailRef = useRef([]);
  const setActionLog = useCallback(u => { actionTrailRef.current = typeof u === "function" ? u(actionTrailRef.current) : u; setActionLogState(actionTrailRef.current); }, []);
  const narrativeRef = useRef([]); // full narrative with timestamps; the on-screen log keeps only the tail
  const gameStartRef = useRef(null);              // timestamp of current game start
  const endTurnRef = useRef(null);                // always-current ref to endTurn
  const [mTaken, setMTaken] = useState([]);
  const mTakenRef = useRef([]);
  const curR = (mMode ? (mRole === "p1" ? "player" : "ai") : "player");
  const [mOppDeck, setMOppDeck] = useState(null);
  const [mWait, setMWait] = useState(false);
  const ws = useRef(null);
  const mRoleRef = useRef(null);
  const aiPlanRef = useRef([]);
  const placingRef = useRef(false); // true while a summoned card is still on its way to the board
  const videoCacheRef = useRef({});  // stem -> "/videos/..." or null

  const playSfx = useCallback((type, fromRemote = false) => {
    if (!audioEnabled || muted) return;

    playSound(type);

    if (mMode && ws.current?.readyState === WebSocket.OPEN && !fromRemote) {
      // Broadcast specific sounds
      if (type.startsWith("battle-") || type.startsWith("revenance") || type === "diffuse") {
        ws.current.send(JSON.stringify({ type: "sync_sfx", sound: type, sender: mRoleRef.current }));
      }
    }
  }, [audioEnabled, muted, mMode]);
  const dismissTitle = useCallback(() => { setShowTitle(false); playSfx("select"); }, [playSfx]);

  const [flash, setFlash] = useState(null); const fQ = useRef([]); const fB = useRef(false);
  const [boardDim, setBoardDim] = useState(false); const dimTimer = useRef(null);
  const boardRef = useRef(null);
  const cinemaRef = useRef(null);
  const enqF = useCallback((text, opts = {}) => {
    if (settings.noAnim) return;
    fQ.current.push({ text: jp ? (JP[text] ?? text) : text, ...opts });
    if (!fB.current) drF();

    if (mMode && ws.current?.readyState === WebSocket.OPEN && !opts.fromRemote) {
      // Strip hidden info for private actions so opponent sees the animation but not the card
      const isPrivate = text === "DRAW" || text === "FREE DRAW" || text === "SET";
      const broadcastOpts = isPrivate
        ? { color: opts.color, border: opts.border, icon: opts.icon, fromRemote: true }
        : { ...opts, fromRemote: true };
      ws.current.send(JSON.stringify({
        type: "sync_anim",
        flash: { text, opts: broadcastOpts },
        sender: mRoleRef.current
      }));
    }
  }, [mMode, locale, settings.noAnim]);
  function drF() {
    if (!fQ.current.length) { fB.current = false; return; } fB.current = true;
    if (settings.noAnim) { fQ.current = []; fB.current = false; setFlash(null); return; }
    const f = fQ.current.shift();
    if (f.video) {
      f.onVideoEnd = () => { setFlash(null); setTimeout(drF, 50); };
      setFlash(f);
      const wait = f.dur !== undefined ? f.dur + 600 : 5000;
      setTimeout(() => { if (flash === f) { setFlash(null); setTimeout(drF, 50); } }, wait);
    } else {
      setFlash(f);
      const dur = f.dur !== undefined ? f.dur : (f.atkCard ? 2400 : f.image ? 1800 : 900);
      setTimeout(() => { setFlash(null); setTimeout(drF, 50); }, dur);
    }
  }

  const [game, setGame] = useState(null);
  const [selH, setSelH] = useState(null); const [selB, setSelB] = useState(null);
  const [hl, setHl] = useState([]); const [mode, setMode] = useState(null); const [tapTgt, setTapTgt] = useState(null); const [pendingSetBattle, setPendingSetBattle] = useState(null);
  const [log, setLog] = useState([]); const logRef = useRef(null); const [aiR, setAiR] = useState(false); const forfeitRef = useRef(false);
  const [aiCue, setAiCue] = useState(null); // { label, cells, hostile } — what the AI is about to do
  const [pit, setPit] = useState({ player: [], ai: [] }); const [showPit, setShowPit] = useState(false);
  const [recentPit, setRecentPit] = useState([]);
  const [eqFlash, setEqFlash] = useState(null); // { r, c, aura } — one-shot equip flash
  const [inspCell, setInspCell] = useState(null);

  const [nc, setNc] = useState({
    name: "", type: "being", soul: 0, mind: 0, will: 0, power: 1,
    gradient: DG.being, image: null, rarity: "common", set: ""
  });
  const [showAutoGen, setShowAutoGen] = useState(false); // kept for compat but unused after forge move
  const [autoGenCfg, setAutoGenCfg] = useState({ count: 4, deckSize: DECK_SIZE, factionMode: "bless", artOnly: false });
  const [packRes, setPackRes] = useState([]); const [packFlip, setPackFlip] = useState([]); const [packSp, setPackSp] = useState([]);
  const [selSI, setSelSI] = useState(0);
  const [forgeMode, setForgeMode] = useState("single");
  const [simulating, setSimulating] = useState(false);
  const [allImages, setAllImages] = useState([]);
  const [forgeImgSize, setForgeImgSize] = useState(80);
  const [genMode, setGenMode] = useState("random"); // "random" or "permute"
  const [genSeed, setGenSeed] = useState(42);
  const [camSeed, setCamSeed] = useState(42);
  const [genImages, setGenImages] = useState({}); // { rowIndex: dataUrl }
  const dragRef = useRef(null); // for drag-swap in forge table
  const randSetColor = () => "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
  const [gen, setGen] = useState({
    name: "New Set", total: 20,
    color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
    pctEntity: 50, pctBless: 15, pctCurse: 15, pctTerrain: 10, pctItem: 10,
    powerMin: 2, powerMax: 6,
    blessPwrMin: 1, blessPwrMax: 3, cursePwrMin: 1, cursePwrMax: 3,
    rarCommon: 64, rarUncommon: 24, rarRare: 8, rarLegendary: 4,
  });
  const [camGen, setCamGen] = useState({
    cardsPerSet: 330,
    distMode: "bell",
    bellSpread: 60,
    startPowerMin: 0, startPowerMax: 3,
    endPowerMin: 1, endPowerMax: 9,
    pctEntity: 55, pctBless: 15, pctCurse: 15, pctTerrain: 5, pctItem: 10,
    startBlessPwrMin: 1, startBlessPwrMax: 3, endBlessPwrMin: 1, endBlessPwrMax: 5,
    startCursePwrMin: 1, startCursePwrMax: 3, endCursePwrMin: 1, endCursePwrMax: 5,
    startEquipPwrMin: 1, startEquipPwrMax: 3, endEquipPwrMin: 1, endEquipPwrMax: 5,
    startTerrPwrMin: 1, startTerrPwrMax: 3, endTerrPwrMin: 1, endTerrPwrMax: 5,
    startRarCommon: 75, startRarUncommon: 18, startRarRare: 5, startRarLegendary: 2,
    endRarCommon: 50, endRarUncommon: 38, endRarRare: 20, endRarLegendary: 2,
    ensureTypes: true,
  });

  const { updateGame } = useGameSync({
    ws, mRoleRef, mTakenRef, gameStartRef, mMode,
    setGame, setTab, setMMode, setMRole, setMTaken, setMAlias, setMOppAlias,
    setMOppDeck, setMWait, setActionLog, setSelDI, setOppDI,
    enqF, playSfx,
  });

  // Live preview — deterministic sample that updates as sliders change
  const livePreview = useMemo(() => {
    const { total, pctEntity, pctBless, pctCurse, pctTerrain, pctItem,
      powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax,
      rarCommon, rarUncommon, rarRare, rarLegendary, ensureTypes } = gen;
    const counts = {
      being: Math.round(total * pctEntity / 100), bless: Math.round(total * pctBless / 100),
      curse: Math.round(total * pctCurse / 100), field: Math.round(total * pctTerrain / 100), equip: Math.round(total * pctItem / 100)
    };
    counts.being += total - Object.values(counts).reduce((a, b) => a + b, 0);
    const rows = []; let seed = genSeed;
    const sR = () => { seed = (seed * 16807) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };

    let perms = [];
    if (genMode === "permute") {
      for (let s = -STAT_MAX; s <= STAT_MAX; s++) for (let m = -STAT_MAX; m <= STAT_MAX; m++) for (let w = -STAT_MAX; w <= STAT_MAX; w++) {
        if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= powerMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= powerMax) perms.push({ soul: s, mind: m, will: w });
      }
      perms = shuffle(perms);
    }
    let pIdx = 0;

    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        let s = 0, m = 0, w = 0, pwr = null;
        if (type === "being") {
          if (genMode === "permute" && perms.length) {
            const p = perms[pIdx++ % perms.length]; s = p.soul; m = p.mind; w = p.will;
          } else {
            for (let a = 0; a < 50; a++) { s = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; m = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; w = Math.floor(sR() * (STAT_MAX * 2 + 1)) - STAT_MAX; if (Math.abs(s) + Math.abs(m) + Math.abs(w) >= powerMin && Math.abs(s) + Math.abs(m) + Math.abs(w) <= powerMax) break; }
          }
        }
        else if (type === "bless") { pwr = blessPwrMin + Math.floor(sR() * (blessPwrMax - blessPwrMin + 1)); }
        else if (type === "curse") { pwr = cursePwrMin + Math.floor(sR() * (cursePwrMax - cursePwrMin + 1)); }
        else if (type === "field") { const v = [0, 0, 0]; v[Math.floor(sR() * 3)] = sR() > .5 ? 1 : -1; v[(Math.floor(sR() * 3) + 1) % 3] = sR() > .5 ? 1 : -1; s = v[0]; m = v[1]; w = v[2]; }
        else if (type === "equip") {
          const v = [0, 0, 0];
          const mag = 1 + Math.floor(sR() * 3);
          const sign = sR() > 0.5 ? 1 : -1;
          v[Math.floor(sR() * 3)] = mag * sign;
          s = v[0]; m = v[1]; w = v[2];
        }
        rows.push({ type, soul: s, mind: m, will: w, rarity: "common", power: pwr, id: i });
      }
    }

    // Distribute rarity: type-diverse, polarity-balanced legendaries
    const getP = c => c.power || (Math.abs(c.soul) + Math.abs(c.mind) + Math.abs(c.will));
    rows.sort((a, b) => getP(b) - getP(a));
    const totalW = rarCommon + rarUncommon + rarRare + rarLegendary;
    const assignedIds = new Set();
    const rarities = ["legendary", "rare", "uncommon"];

    rarities.forEach(rar => {
      const rarKey = rar === "legendary" ? "rarLegendary" : rar === "rare" ? "rarRare" : "rarUncommon";
      const targetCount = Math.round(total * gen[rarKey] / totalW);
      let rarAssigned = 0;

      if (ensureTypes) {
        for (const t of ["being", "bless", "curse", "field", "equip"]) {
          if (rarAssigned >= targetCount) break;
          const idx = rows.findIndex((c, i) => !assignedIds.has(c.id) && c.type === t);
          if (idx >= 0) { rows[idx].rarity = rar; assignedIds.add(rows[idx].id); rarAssigned++; }
        }
      }

      if (rar === "legendary") {
        const lpols = ["light", "dark", "balanced"]; let lpI = 0;
        rows.forEach((card) => {
          if (rarAssigned >= targetCount || assignedIds.has(card.id) || card.type !== "being") return;
          const au = card.soul + card.mind + card.will;
          const tgt = lpols[lpI % 3];
          if ((tgt === "light" && au > 0) || (tgt === "dark" && au < 0) || (tgt === "balanced" && au === 0)) {
            card.rarity = "legendary"; assignedIds.add(card.id); rarAssigned++; lpI++;
          }
        });
      }

      rows.forEach(card => {
        if (rarAssigned >= targetCount || assignedIds.has(card.id)) return;
        card.rarity = rar; assignedIds.add(card.id); rarAssigned++;
      });
    });

    rows.forEach(card => { if (!assignedIds.has(card.id)) card.rarity = "common"; });

    const countsMap = new Map();
    rows.forEach(r => {
      const k = `${r.type}|${r.soul}|${r.mind}|${r.will}|${r.power}`;
      countsMap.set(k, (countsMap.get(k) || 0) + 1);
    });
    rows.forEach(r => {
      r.isUnique = countsMap.get(`${r.type}|${r.soul}|${r.mind}|${r.will}|${r.power}`) === 1;
    });

    return rows;
  }, [gen, genMode, genSeed]);

  const campaignPreview = useMemo(() => {
    const lerp = (a, b, t) => a + (b - a) * t;
    const n = CAMPAIGN_SET_IDS.length;
    // Per-set card count distribution
    const total = camGen.cardsPerSet * n;
    let setCounts;
    if (camGen.distMode === "bell") {
      const center = (n - 1) / 2;
      const sigma = Math.max(0.5, (n / 2) * (camGen.bellSpread / 100));
      const weights = Array.from({ length: n }, (_, i) => Math.exp(-0.5 * ((i - center) / sigma) ** 2));
      const sumW = weights.reduce((a, b) => a + b, 0);
      setCounts = weights.map(w => Math.max(1, Math.round(w / sumW * total)));
      const diff = total - setCounts.reduce((a, b) => a + b, 0);
      setCounts[Math.floor(n / 2)] = Math.max(1, (setCounts[Math.floor(n / 2)] || 1) + diff);
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
    return CAMPAIGN_SET_IDS.map((setId, si) => {
      const t = si / (n - 1);
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
      return { setId, si, t, cards: setCounts[si], powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax, equipPwrMin, equipPwrMax, terrPwrMin, terrPwrMax, rarCommon, rarUncommon, rarRare, rarLegendary };
    });
  }, [camGen]);

  // O(1) lookups — rebuilt only when cardPool or sets change
  const cardMap = useMemo(() => new Map(cardPool.map(c => [c.id, c])), [cardPool]);
  const cardSetMap = useMemo(() => {
    const m = new Map();
    sets.forEach(s => s.cardIds.forEach(id => m.set(id, s.name)));
    return m;
  }, [sets]);

  // Pre-filtered lists so tab switches don't re-run heavy chains


  const ownedCardPool = useMemo(() => FREE_POOL ? cardPool : cardPool.filter(c => (coll[c.id] || 0) > 0), [cardPool, coll]);

  const addLog = useCallback(m => { narrativeRef.current.push({ t: Date.now(), m }); setLog(p => [...p.slice(-60), m]); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  // Persist via backend API, or this browser's storage in the live build (src/hooks/usePersistence.js)
  const API = "/api";
  const { baseSettings } = usePersistence({
    dbR, setDbR, setLoading,
    cardPool, setCardPool, decks, setDecks, coll, setColl, sets, setSets,
    tokens, setTokens, settings, setSettings, setAudioEnabled,
  });
  useEffect(() => { if (tab === "create" && forgeMode === "single") refreshImages(); }, [tab, forgeMode]);


  const handleKeys = useCallback((e) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if ((tab !== "play" && tab !== "duel") || !game || game.ph !== "playing" || aiR) return;

    // In multiplayer, only the active player can use shortcuts
    if (mMode && game.turn !== curR) return;

    const k = e.key.toLowerCase();
    if (k === "d") { drawCard(); }
    else if (k === "e") { endTurn(); }
    else if (k === "q") { forfeit(); }
    else if (k === "p") { setShowPit(p => !p); }
    else if (k === "escape" || k === "c") { clr(); }
    else if (k === "b") { if (mode === "bless" || mode === "curse") playBC(mode); }
    else if (k === "s") { if (mode === "chooseStat") resolveTap("soul"); else if (mode === "bless" || mode === "curse") doSetTrap(); else if (mode === "equip") doSetEquip(); else if (mode === "playField") doSetField(); else if (mode === "summon" && BEING_SET_ENABLED) doSetBeing(); }
    else if (k === "w") { if (mode === "chooseStat") resolveTap("will"); }
    else if (k === "m") { if (mode === "chooseStat") resolveTap("mind"); }
    // Number keys 1-9: select hand card
    else if (/^[1-9]$/.test(k)) {
      const idx = parseInt(k) - 1;
      const mhk = curR === "player" ? "pH" : "aH";
      if (game[mhk] && idx < game[mhk].length) selectHand(idx);
    }
  }, [tab, game, aiR, drawCard, endTurn, forfeit, mode, clr, doSetTrap, doSetEquip, doSetField, playBC, resolveTap, mMode, mRole, curR, selectHand]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [handleKeys]);

  // Game engine — ownership-aware C shift helper
  // ─── Game engine (src/engine.js) — fx bag carries setters, sfx, and live config ───
  const fx = {
    setGame, setPit, setRecentPit, setTokens, setEqFlash, setAiR, setAiCue,
    PACE: PACES[settings.pace] || PACES.normal,
    addLog, enqF, playSfx, videoFor, saveGameLog, jp, fB, forfeitRef, aiPlanRef, pit,
    logAction: (a, g) => setActionLog(prev => [...prev.slice(-499), {
      type: a.type, role: "ai", cardId: (a.card || a.item)?.id, row: a.row, col: a.col,
      fromRow: a.fromRow, fromCol: a.fromCol, toRow: a.toRow, toCol: a.toCol, stat: a.stat, ts: Date.now(), c: g.c, tn: g.tn,
    }]),
    C_MAX, TOKENS_PER_WIN, actionsPerTurn,
    PRESENCE_ENABLED, BEING_SET_ENABLED, TRIBUTE_SUMMON_ENABLED,
    KOTH_ENABLED: settings.kingOfTheHillEnabled,
    COMBAT_CAP, TURN_CAP, ATTACKS_PER_BEING, // optional limits, 0 = off
    EDGE_WRAP, // optional: zero-aura attacks carry over the board edges
  };
  function combatC(g, dmg, winningStat, winnerOwner, battleOpts, atkCard, defCard, atkWon, logPrefix, statKey) { engineCombatC(g, dmg, winningStat, winnerOwner, battleOpts, atkCard, defCard, atkWon, logPrefix, statKey, fx); }
  function applyC(g, amt, skipSfx) { engineApplyC(g, amt, fx, skipSfx); }
  function toPit(card, owner) { engineToPit(card, owner, fx); }
  function reshufflePit(g, role) { engineReshufflePit(g, role, fx); }
  function chkTraps(g, r, c, mover, movingCell, isFieldTrans = false) { return engineChkTraps(g, r, c, mover, movingCell, isFieldTrans, fx); }
  function checkFieldFreeings(g) { engineCheckFieldFreeings(g, fx); }
  function chkPresence(g) { engineChkPresence(g, fx); }
  function chkCenter(g) { engineChkCenter(g, fx); }
  function runAI(g, idx) { engineRunAI(g, idx, fx); }
  function stemFor(image) {
    if (!image) return null;
    return image.replace(/^\/images\//, "").replace(/\.[^.]+$/, "");
  }
  function videoFor(card) {
    if (!card) return null;
    if (card.video) return card.video; // explicit legacy field
    const stem = stemFor(card.image);
    return stem ? (videoCacheRef.current[stem] ?? null) : null;
  }
  async function resolveVideoCache(cards) {
    const stems = [...new Set(cards.map(c => stemFor(c.image)).filter(s => s && !(s in videoCacheRef.current)))];
    if (!DEV || !stems.length) return; // card videos are served by the backend
    try {
      const r = await fetch(`${API}/videos/resolve-batch?stems=${stems.join(",")}`);
      if (r.ok) Object.assign(videoCacheRef.current, await r.json());
    } catch {}
  }

  const deckRules = { deckSize: DECK_SIZE, maxCopies: MAX_COPIES, spellBudget };
  function startGame() {
    // Illegal decks can't start — the lobby shows the reason next to the start button
    if ([decks[selDI], decks[oppDI]].some(d => validateDeck(d, cardPool, deckRules).errors.length)) return;
    forfeitRef.current = false;
    playSfx("judgment");
    const pIds = decks[selDI]?.cards || []; const aIds = decks[oppDI]?.cards || [];
    const pD = shuffle(pIds.map(id => gc(id, cardPool)).filter(Boolean));
    const aD = shuffle(aIds.map(id => gc(id, cardPool)).filter(Boolean));
    resolveVideoCache([...pD, ...aD]); // fire-and-forget; populates cache before first play
    const pDk = decks[selDI];
    const pMag = getDeckMagnitude(pDk, cardPool);
    const pRole = pMag < 0 ? "dark" : "light";
    const turn = Math.random() < 0.5 ? "player" : "ai";
    const startG = {
      bd: Array.from({ length: 5 }, () => Array(5).fill(null)),
      pH: pD.splice(0, HAND_SIZE), aH: aD.splice(0, HAND_SIZE),
      pD, aD, c: 0, c0: 0, cMoved: false, turn, act: actionsPerTurn, tn: 1, ph: "playing", win: null, pRole, flips: 0, seq: 0
    };

    if (tab === "duel") {
      ws.current.send(JSON.stringify({ type: "start_game", state: startG }));
    } else {
      setActionLog([]); gameStartRef.current = Date.now(); narrativeRef.current = [];
      setGame(startG);
      setMMode(false); // Ensure mMode is false for local play
      setPit({ player: [], ai: [] }); clr(); setLog([]); addLog(`0C. ${turn === "player" ? "Your" : "Opponent"} turn.`);
      if (turn === "ai") {
        setAiR(true);
        setTimeout(() => runAI(startG, 0), 1000 + fx.PACE.beat);
      }
      requestAnimationFrame(() => enqF("Genesis", { color: T.silverBright, border: T.silver, icon: jp ? "創" : "G" }));
    }
  }

  const isMyTurn = useCallback(() => {
    if (!game || game.ph !== "playing") return false;
    return game.turn === curR;
  }, [game, curR]);

  // Auto-advance: when the active player runs out of actions, end the turn automatically
  useEffect(() => {
    if (!game || game.ph !== "playing" || aiR) return;
    if (game.act <= 0 && game.turn === curR) {
      const t = setTimeout(() => endTurnRef.current?.(), 1800);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.act, game?.turn, game?.ph, aiR, curR]);

  // A turn changing hands is announced (the board shows a banner; see DuelBoard)
  const lastTurnRef = useRef(null), lastPhRef = useRef(null);
  useEffect(() => {
    const turn = game?.ph === "playing" ? game.turn : null;
    if (turn && lastTurnRef.current && turn !== lastTurnRef.current) playSfx(turn === curR ? "turn-you" : "turn-opp");
    lastTurnRef.current = turn;
    // ...and so is the game ending
    if (game?.ph === "over" && lastPhRef.current === "playing" && game.win) playSfx(game.win !== curR ? "defeat" : game.c > 0 ? "victory-light" : "victory-dark");
    lastPhRef.current = game?.ph ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.turn, game?.ph]);

  function clr() { setSelH(null); setSelB(null); setHl([]); setMode(null); setTapTgt(null); setInspCell(null); setPendingSetBattle(null); }
  function forfeit() {
    // Kill all animations instantly
    forfeitRef.current = true; placingRef.current = false; setAiCue(null);
    fQ.current = []; fB.current = false; setFlash(null);
    if (mMode) {
      ws.current.send(JSON.stringify({ type: "reset" }));
    }
    setGame(null); setLog([]); setAiR(false); setPit({ player: [], ai: [] }); setRecentPit([]); setInspCell(null); setMMode(false);
  }

  function drawCard() {
    if (!game || game.ph !== "playing" || !isMyTurn() || game.act <= 0 || placingRef.current) return;
    const mr = curR;
    const mdk = mr === "player" ? "pD" : "aD";
    const mhk = mr === "player" ? "pH" : "aH";
    const g = { ...game, [mdk]: [...game[mdk]], [mhk]: [...game[mhk]], act: game.act - 1 };
    reshufflePit(g, mr);
    if (!g[mdk].length) return;

    playSfx("draw");
    const c = g[mdk].shift(); g[mhk].push(c);
    addLog(`Draw: ${c.name || "Card"}`);

    updateGame(g, { type: ACTION_TYPES.DRAW }); clr();
  }
  function selectHand(idx) {
    if (selH === idx) { clr(); return; }  // re-click same card = deselect
    const mr = curR;
    if (!game || game.turn !== mr || game.ph !== "playing" || placingRef.current) return;
    if (selB !== null) clr();  // clicking a hand card while a board entity is selected — clear first
    const mhk = mr === "player" ? "pH" : "aH";
    const c = game[mhk][idx]; setSelH(idx); setSelB(null);
    if (c.type === "being") {
      if (game.act <= 0) return;
      if (TRIBUTE_SUMMON_ENABLED && Math.abs(aura(c)) > 5) {
        // Tribute summon: highlight own board entities to sacrifice
        const cells = [];
        for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
          const cl = game.bd[r][col];
          if (cl?.ow === mr && cl.cd.type === "being" && !cl.fd) cells.push([r, col]);
        }
        setHl(cells); setMode("tribute"); return;
      }
      const cells = [];
      if (mr === "player") {
        for (let r = 3; r < 5; r++) for (let col = 0; col < 5; col++) if (!game.bd[r][col]) cells.push([r, col]);
      } else {
        for (let r = 0; r < 2; r++) for (let col = 0; col < 5; col++) if (!game.bd[r][col]) cells.push([r, col]);
      }
      // Field overlap: any unoccupied cell adjacent to 2+ face-up fields
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        if (!game.bd[r][col] && countAdjFaceUpFields(r, col, game.bd) >= 2 && !cells.some(([cr, cc]) => cr === r && cc === col))
          cells.push([r, col]);
      }
      // Aura-zero entity (net soul+mind+will = 0): can purge any field and any face-down card on the board
      if (isTranscendent(c)) {
        for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
          const cell = game.bd[r][col];
          if (cell && (cell.cd?.type === "field" || cell.fd)) cells.push([r, col]);
        }
      }
      // Void being (0/0/0): free placement on any empty cell
      if (isVoid(c)) {
        for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++)
          if (!game.bd[r][col] && !cells.some(([cr, cc]) => cr === r && cc === col))
            cells.push([r, col]);
      }
      // Beacon: any empty cell in 8-dir around a friendly void being already on board
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        const cl = game.bd[r][col];
        if (cl?.ow === mr && cl.cd.type === "being" && !cl.fd && isVoid(cl.cd)) {
          for (const [ar, ac] of adjFull(r, col))
            if (!game.bd[ar][ac] && !cells.some(([cr, cc]) => cr === ar && cc === ac))
              cells.push([ar, ac]);
        }
      }
      setHl(cells); setMode("summon");
    }
    else if (c.type === "bless" || c.type === "curse") { if (game.act <= 0) return; setHl([]); setMode(c.type); }
    else if (c.type === "field") {
      if (game.act < 1) { setHl([]); setMode("playField"); return; } // no actions — can only set (free)
      const cells = [];
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        if (!game.bd[r][col] && !hasAdjSetOrField(r, col, game.bd)) cells.push([r, col]);
      }
      setHl(cells); setMode("playField");
    }
    else if (c.type === "equip") {
      if (game.act <= 0) return;
      const cells = [];
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
        const cl = game.bd[r][col];
        if (cl?.ow === mr && cl.cd.type === "being") cells.push([r, col]);
      }
      setHl(cells); setMode("equip");
    }
  }
  function playBC(type) {
    if (!game || selH === null) return;
    const mr = curR;
    const mhk = mr === "player" ? "pH" : "aH";
    const c = game[mhk][selH]; const pwr = cPwr(c); const cost = game.c === 0 && game.cMoved ? 0 : 1;
    if (game.act < cost) return;
    const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(r => [...r]) };
    g[mhk].splice(selH, 1); g.act -= cost;
    playSfx(`spell-${type}`);
    if (type === "bless") { enqF(`+${pwr}C`, { color: T.bless, border: T.bless, icon: "△", image: c.image, video: videoFor(c) }); applyC(g, pwr); addLog(`Play: ${c.name || "Bless"} (+${pwr}C)`); }
    else { enqF(`−${pwr}C`, { color: T.curse, border: T.curse, icon: "▽", image: c.image, video: videoFor(c) }); applyC(g, -pwr); addLog(`Play: ${c.name || "Curse"} (−${pwr}C)`); }
    const draws = pwr === 1 ? 1 : 0;
    const mdk = mr === "player" ? "pD" : "aD";
    g[mdk] = [...g[mdk]];
    for (let di = 0; di < draws; di++) {
      if (!g[mdk].length) reshufflePit(g, mr);
      if (!g[mdk].length) break;
      const drawn = g[mdk].shift();
      g[mhk].push(drawn);
      playSfx("draw");
      addLog(`Draw: ${drawn.name || "Card"} (free)`);
    }
    toPit(c, mr); updateGame(g, { type: ACTION_TYPES.PLAY_BC, cardType: type, handIdx: selH, role: mr }); clr();
  }
  function doSetTrap() {
    if (!game || selH === null) return;
    const cells = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (!game.bd[r][c] && !hasAdjOccupied(r, c, game.bd)) cells.push([r, c]);
    }
    setHl(cells); setMode("setTrap");
  }
  function doSetEquip() {
    if (!game || selH === null) return;
    const mr = curR; const mhk = mr === "player" ? "pH" : "aH";
    if (game[mhk][selH]?.type !== "equip") return;
    if (game.act !== 1) { addLog("Can only set equip as your last action."); return; }
    const cells = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!game.bd[r][c] && !hasAdjOccupied(r, c, game.bd)) cells.push([r, c]);
    setHl(cells); setMode("setEquip");
  }
  function doSetField() {
    if (!game || selH === null) return;
    const cells = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (!game.bd[r][c] && !hasAdjOccupied(r, c, game.bd)) cells.push([r, c]);
    }
    setHl(cells); setMode("setField");
  }
  function doSetBeing() {
    if (!game || selH === null || !BEING_SET_ENABLED) return;
    const mr = curR; const mhk = mr === "player" ? "pH" : "aH";
    const c = game[mhk][selH];
    if (c?.type !== "being") return;
    if (TRIBUTE_SUMMON_ENABLED && Math.abs(aura(c)) > 5) { addLog("Cannot set tribute-level beings."); return; }
    // Being set zones: own 2 rows + middle row (row 2), plus field overlap, void, beacon
    const cells = [];
    if (mr === "player") {
      for (let r = 2; r < 5; r++) for (let col = 0; col < 5; col++) if (!game.bd[r][col]) cells.push([r, col]);
    } else {
      for (let r = 0; r < 3; r++) for (let col = 0; col < 5; col++) if (!game.bd[r][col]) cells.push([r, col]);
    }
    for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
      if (!game.bd[r][col] && countAdjFaceUpFields(r, col, game.bd) >= 2 && !cells.some(([cr, cc]) => cr === r && cc === col))
        cells.push([r, col]);
    }
    if (isVoid(c)) {
      for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++)
        if (!game.bd[r][col] && !cells.some(([cr, cc]) => cr === r && cc === col)) cells.push([r, col]);
    }
    for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
      const cl = game.bd[r][col];
      if (cl?.ow === mr && cl.cd.type === "being" && !cl.fd && isVoid(cl.cd)) {
        for (const [ar, ac] of adjFull(r, col))
          if (!game.bd[ar][ac] && !cells.some(([cr, cc]) => cr === ar && cc === ac)) cells.push([ar, ac]);
      }
    }
    setHl(cells.filter(([cr, cc]) => !hasAdjOccupied(cr, cc, game.bd))); setMode("setBeing");
  }
  function doPlayField() {
    if (!game || selH === null || game.act < 1) return;
    const cells = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (!game.bd[r][c] && !hasAdjSetOrField(r, c, game.bd)) cells.push([r, c]);
    }
    setHl(cells); setMode("playField");
  }
  function boardClick(vr, vc) {
    const mr = curR;
    const or = mr === "player" ? "ai" : "player";
    const r = (mr === "ai") ? 4 - vr : vr;
    const c = (mr === "ai") ? 4 - vc : vc;

    if (!game || game.turn !== mr || game.ph !== "playing" || (mr === "player" && aiR) || placingRef.current) return;
    const mhk = mr === "player" ? "pH" : "aH";
    const isH = hl.some(([hr, hc]) => hr === r && hc === c);
    const cell = game.bd[r][c];

    if (mode === "setTrap" && selH !== null && isH) {
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = g[mhk].splice(selH, 1)[0];
      g.bd[r][c] = { cd: card, ow: mr, fd: true, prm: 1 };
      playSfx("set");
      enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "▼", image: card.image });
      addLog(`Set: Trap`);
      updateGame(g, { type: ACTION_TYPES.SET_TRAP, row: r, col: c, handIdx: selH }); clr(); return;
    }
    if (mode === "setEquip" && selH !== null && isH) {
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = g[mhk].splice(selH, 1)[0];
      g.bd[r][c] = { cd: card, ow: mr, fd: true, prm: 1 };
      playSfx("set");
      enqF("SET EQUIP", { color: TC.equip, border: TC.equip, icon: "▼", image: card.image });
      addLog(`Set: Equip`);
      updateGame(g, { type: ACTION_TYPES.SET_EQUIP, row: r, col: c, handIdx: selH }); clr(); return;
    }
    if (mode === "setBeing" && selH !== null && isH) {
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = g[mhk].splice(selH, 1)[0];
      g.bd[r][c] = { cd: card, ow: mr, fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } };
      playSfx("set");
      enqF("SET", { color: T.silverDim, border: T.silverDim, icon: "▼" });
      addLog(`Set: Being`);
      updateGame(g, { type: ACTION_TYPES.SET_BEING, row: r, col: c, handIdx: selH }); clr(); return;
    }
    if (mode === "tribute" && selH !== null && isH) {
      // Selected a tribute entity — tribute summon can land anywhere empty (tribute cell frees up too)
      const summonCells = [];
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++)
        if (!game.bd[row][col] || (row === r && col === c)) summonCells.push([row, col]);
      setSelB([r, c]); setHl(summonCells); setMode("tributePlace"); return;
    }
    if (mode === "tributePlace" && selH !== null && selB !== null && isH) {
      const cost = 1;
      if (game.act < cost) return;
      const [tr, tc] = selB;
      const tributeCell = game.bd[tr][tc];
      if (!tributeCell) { clr(); return; }
      playSfx("summon"); placingRef.current = true;
      const gInterim = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = gInterim[mhk].splice(selH, 1)[0];
      gInterim.act -= cost;
      gInterim.bd[tr][tc] = null;
      toPit(tributeCell.cd, mr);
      setGame({ ...gInterim, seq: (gInterim.seq || 0) + 1 });
      enqF("TRIBUTE", { color: T.legendary, border: T.legendary, icon: "✦", image: card.image, video: videoFor(card) });
      addLog(`Tribute: ${tributeCell.cd?.name || "Being"} → ${card.name || "Being"}`);
      clr();
      setTimeout(() => {
        placingRef.current = false;
        const gFull = { ...gInterim, bd: gInterim.bd.map(row => [...row]) };
        gFull.bd[r][c] = { cd: card, ow: mr, fd: false, ib: { soul: 0, mind: 0, will: 0 } };
        updateGame(gFull, { type: ACTION_TYPES.TRIBUTE_SUMMON, row: r, col: c, handIdx: selH, tribRow: tr, tribCol: tc });
      }, placeDelay(card));
      return;
    }
    if (mode === "playField" && selH !== null && isH) {
      if (game.act < 1) return;
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = g[mhk].splice(selH, 1)[0];
      g.act -= 1;
      g.bd[r][c] = { cd: card, ow: mr, fd: false, ib: { soul: 0, mind: 0, will: 0 } };
      playSfx("field");
      enqF("FIELD", { color: TC.field, border: TC.field, icon: "▣", image: card.image, video: videoFor(card) });
      addLog(`Field: ${card.name || "Field"} (played)`);
      updateGame(g, { type: ACTION_TYPES.TERRAIN, row: r, col: c, handIdx: selH, faceUp: true }); clr(); return;
    }
    if ((mode === "summon" || mode === "setField") && selH !== null && isH) {
      const isSummon = mode === "summon";
      const cost = isSummon ? 1 : 0;
      if (isSummon && game.act < 1) return;
      playSfx(isSummon ? "summon" : "set"); placingRef.current = true;
      const existing = game.bd[r][c];
      const isPurge = isSummon && existing && (existing.cd?.type === "field" || existing.fd);
      // Interim state: action spent + card removed from hand, but entity NOT yet on board
      const gInterim = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const card = gInterim[mhk].splice(selH, 1)[0];
      gInterim.act -= cost;
      if (isPurge) gInterim.bd[r][c] = null; // clear terrain/trap immediately in interim
      setGame({ ...gInterim, seq: (gInterim.seq || 0) + 1 });
      if (isPurge) {
        toPit(existing.cd, existing.ow);
        enqF("PURGE", { color: TC.field, border: TC.field, icon: "✕", image: card.image });
        addLog(`Purge: ${existing.cd?.name || existing.cd?.type}`);
      } else {
        enqF(isSummon ? "SUMMON" : "FIELD", { color: T.silver, border: TC[card.type], image: card.image, video: videoFor(card) });
        addLog(`${isSummon ? "Summon" : "Field"}: ${card.name || card.type}`);
      }
      clr();
      // Place entity on board as the flash fades, so its landing is what the eye sees next
      setTimeout(() => {
        placingRef.current = false;
        const gFull = { ...gInterim, bd: gInterim.bd.map(row => [...row]) };
        gFull.bd[r][c] = isSummon
          ? { cd: card, ow: mr, fd: false, ib: { soul: 0, mind: 0, will: 0 } }
          : { cd: card, ow: mr, fd: true, prm: 1, ib: { soul: 0, mind: 0, will: 0 } };
        updateGame(gFull, { type: isSummon ? ACTION_TYPES.SUMMON : ACTION_TYPES.TERRAIN, row: r, col: c, handIdx: selH });
      }, isPurge ? 1000 : placeDelay(card));
      return;
    }
    if (mode === "equip" && selH !== null && isH) {
      const g = { ...game, [mhk]: [...game[mhk]], bd: game.bd.map(row => [...row]) };
      const item = g[mhk].splice(selH, 1)[0]; const ncell = { ...g.bd[r][c] };
      playSfx("equip");
      STAT_DEFS.forEach(s => { ncell.ib[s.key] = (ncell.ib?.[s.key] || 0) + (item[s.key] || 0); });
      g.bd[r][c] = ncell; g.act--;
      enqF("EQUIP", { color: T.item, border: T.item, icon: "⊕", image: item.image });
      addLog(`Equip: ${item.name || item.type}`);
      toPit(item, mr);
      const itemAura = aura(item); setEqFlash({ r, c, aura: itemAura }); setTimeout(() => setEqFlash(null), 900);
      updateGame(g, { type: ACTION_TYPES.EQUIP, row: r, col: c, handIdx: selH }); clr(); return;
    }
    if (cell?.ow === mr && cell.fd && cell.cd?.type !== "equip" && !mode) {
      if (game.flips >= 2) { addLog("Max 2 flips per turn reached."); return; }
      const ready = (cell.prm || 0) <= 0;
      if (!ready) { addLog(`Wait. A card can't be flipped the turn it is set.`); return; }

      playSfx(cell.cd.type === "bless" || cell.cd.type === "curse" ? `spell-${cell.cd.type}` : "flip");
      const g = { ...game, bd: game.bd.map(row => [...row]), flips: game.flips + 1 };
      if (cell.cd.type === "being") {
        // Being flips face-up and stays on board
        g.bd[r][c] = { ...cell, fd: false };
        enqF("REVEAL", { color: TC.being || T.being, border: TC.being || T.being, image: cell.cd.image, video: videoFor(cell.cd) });
        addLog(`Reveal: ${cell.cd.name || "Being"}`);
      } else if (cell.cd.type === "field") {
        // Field flips face-up and stays on board as terrain buff
        g.bd[r][c] = { ...cell, fd: false };
        enqF("FIELD", { color: TC.field, border: TC.field, icon: "▣", image: cell.cd.image, video: videoFor(cell.cd) });
        addLog(`Field: ${cell.cd.name || "Field"} activated`);
      } else {
        const pwr = cPwr(cell.cd);
        const isB = cell.cd.type === "bless";
        if (isB) { enqF(`+${pwr}C`, { color: T.bless, border: T.bless, icon: "△", image: cell.cd.image, video: videoFor(cell.cd) }); applyC(g, pwr); addLog(`Trigger: ${cell.cd.name || "Bless"} (+${pwr}C)`); }
        else { enqF(`−${pwr}C`, { color: T.curse, border: T.curse, icon: "▽", image: cell.cd.image, video: videoFor(cell.cd) }); applyC(g, -pwr); addLog(`Trigger: ${cell.cd.name || "Curse"} (−${pwr}C)`); }
        toPit(cell.cd, mr); g.bd[r][c] = null;
      }
      updateGame(g, { type: ACTION_TYPES.FLIP, row: r, col: c }); clr(); return;
    }

    if (cell?.ow === mr && cell.cd.type === "being" && !cell.fd && mode !== "chooseStat") {
      setSelB([r, c]); setSelH(null); setInspCell([r, c]);
      const effS = getEff(cell.cd, game.bd, r, c, cell.ib);
      const isT = aura(effS) === 0;
      const isFieldTrans = isT;
      const moveA = adj(r, c, isT ? 2 : 1).filter(([tr, tc]) => canReach(r, c, tr, tc, game.bd));
      const canAtk = !(ATTACKS_PER_BEING > 0 && (cell.atk || 0) >= ATTACKS_PER_BEING);
      // A target reached over a board edge carries a third element so the board can label it
      const atkA = !canAtk ? [] : attackCells(r, c, isT, EDGE_WRAP).map(([ar, ac]) => [ar, ac, isWrapAttack(r, c, ar, ac)]);
      setHl([
        ...moveA.filter(([ar, ac]) => { const d = game.bd[ar][ac]; if (!d) return true; if (d.fd && d.ow === mr && d.cd?.type === "equip" && (d.prm || 0) > 0) return false; if (d.fd && d.ow === mr && d.cd?.type === "being") return false; if (d.fd) return true; if (!d.fd && d.cd?.type === "field" && d.ow === mr) return true; return isFieldTrans && d.cd?.type === "field"; }),
        ...atkA.filter(([ar, ac]) => { const t = game.bd[ar]?.[ac]; return t && t.ow === or && t.cd.type === "being" && !t.fd; })
      ]);
      setMode("moveOrTap"); return;
    }
    // Inspect: click any occupied cell when no mode is active
    if (cell && !mode && !selH) { setInspCell([r, c]); return; }
    if (mode === "moveOrTap" && selB && isH) {
      const [sr, sc] = selB;
      const dest = game.bd[r][c];
      const movingEnt0 = game.bd[sr][sc];
      const movingEffS0 = movingEnt0 ? getEff(movingEnt0.cd, game.bd, sr, sc, movingEnt0.ib) : null;
      const isMovingFieldTrans = movingEffS0 && aura(movingEffS0) === 0;
      const isTerrainTarget = dest && !dest.fd && dest.cd?.type === "field";
      if (dest?.fd && dest.cd?.type === "being" && dest.ow === or && BEING_SET_ENABLED) {
        if (game.act <= 0) return;
        if (ATTACKS_PER_BEING > 0 && (movingEnt0?.atk || 0) >= ATTACKS_PER_BEING) { addLog("That being has already attacked this turn."); return; }
        setPendingSetBattle({ sr, sc, r, c, isMovingFieldTrans });
        setTapTgt([r, c]); setMode("chooseStat"); setHl([]);
      }
      else if (!dest || dest.fd || (isMovingFieldTrans && isTerrainTarget) || (isTerrainTarget && dest.ow === mr)) {
        if (game.act <= 0) return;
        const g = { ...game, bd: game.bd.map(row => [...row]) };
        const movingEnt = g.bd[sr][sc];
        g.bd[sr][sc] = null;
        const consumed = chkTraps(g, r, c, mr, movingEnt, isMovingFieldTrans);
        if (!consumed) g.bd[r][c] = movingEnt;
        checkFieldFreeings(g); playSfx("move");
        g.act--; updateGame(g, { type: ACTION_TYPES.MOVE, fromRow: sr, fromCol: sc, row: r, col: c }); clr();
      }
      else if (game.bd[r][c]?.ow === or) { if (game.act <= 0) return; setTapTgt([r, c]); setMode("chooseStat"); setHl([]); }
      return;
    }
    // Click-off: clicking any non-handled cell while something is selected cancels the selection
    if (mode || selH !== null || selB !== null) clr();
  }
  function resolveTap(stat) {
    if (pendingSetBattle) { resolveSetBattle(stat); return; }
    if (!game || !selB || !tapTgt) return; const [ar, ac] = selB; const [dr, dc] = tapTgt;
    const mr = curR; const or = mr === "player" ? "ai" : "player";
    const atk = game.bd[ar][ac]; const def = game.bd[dr][dc]; if (!atk || !def) return;
    const aS = getEff(atk.cd, game.bd, ar, ac, atk.ib); const dS = getEff(def.cd, game.bd, dr, dc, def.ib);
    const result = resolveCombat(aS, dS, stat);
    const g = { ...game, bd: game.bd.map(row => [...row]) }; g.act--;
    const battleOpts = { atkCard: atk.cd, defCard: def.cd, sub: `${stat.toUpperCase()} |${aS[stat]}| vs |${dS[stat]}|` };
    const aVal = Math.abs(aS[stat]); const dVal = Math.abs(dS[stat]);
    if (result.winner === "attacker") {
      // Attacker (whoever's turn it is — p2 plays the "ai" seat in a duel) won
      g.bd[dr][dc] = null; toPit(def.cd, or);
      g.bd[ar][ac] = { ...atk, atk: (atk.atk || 0) + 1 };
      combatC(g, result.dmg, result.winningStat, mr, battleOpts, atk.cd, def.cd, true,
        `⚔ ${atk.cd.name || "Atk"} |${aVal}| > ${def.cd.name || "Def"} |${dVal}| [${stat.toUpperCase()}]`, stat);
    } else if (result.winner === "defender") {
      // Defender won
      g.bd[ar][ac] = null; toPit(atk.cd, mr);
      combatC(g, result.dmg, result.winningStat, or, battleOpts, atk.cd, def.cd, false,
        `⚔ ${atk.cd.name || "Atk"} |${aVal}| < ${def.cd.name || "Def"} |${dVal}| [${stat.toUpperCase()}]`, stat);
    } else {
      g.bd[ar][ac] = null; g.bd[dr][dc] = null;
      toPit(atk.cd, mr); toPit(def.cd, or);
      playSfx(`battle-${stat[0]}`);
      enqF("⚔", { color: T.textDim, border: T.textDim, ...battleOpts, tie: true });
      addLog(`⚔ ${atk.cd.name || "Atk"} |${aVal}| = ${def.cd.name || "Def"} |${dVal}| (tie) [${stat.toUpperCase()}]`);
    }
    updateGame(g, { type: ACTION_TYPES.ATTACK, atkRow: ar, atkCol: ac, defRow: dr, defCol: dc, stat }); clr();
  }
  function resolveSetBattle(stat) {
    if (!game || !pendingSetBattle) return;
    const { sr, sc, r, c } = pendingSetBattle;
    const mr = curR; const or = mr === "player" ? "ai" : "player";
    const movingEnt = game.bd[sr][sc];
    const setCell = game.bd[r][c];
    if (!movingEnt || !setCell) { clr(); return; }

    const statDef = STAT_DEFS.find(s => s.key === stat);
    const statLabel = jp ? (JP_STATS[stat] ?? statDef.label) : stat.toUpperCase();

    // Phase 1: Show chosen stat + move attacker off source
    playSfx("action");
    enqF(statLabel, { color: statDef.color, border: statDef.color, icon: statDef.label, image: movingEnt.cd.image });
    addLog(`⚔ ${movingEnt.cd.name || "Atk"} chose ${stat.toUpperCase()}`);

    const g1 = { ...game, bd: game.bd.map(row => [...row]) };
    g1.bd[sr][sc] = null;
    setGame({ ...g1, seq: (g1.seq || 0) + 1 });
    setPendingSetBattle(null); setMode(null); setTapTgt(null); setSelB(null); setHl([]);

    // Phase 2: Reveal set being (after stat flash finishes)
    setTimeout(() => {
      const g2 = { ...g1, bd: g1.bd.map(row => [...row]) };
      g2.bd[r][c] = { ...setCell, fd: false };
      enqF("REVEAL", { color: TC.being || T.being, border: TC.being || T.being, image: setCell.cd.image });
      addLog(`▼ Revealed: ${setCell.cd.name || "Being"}`);
      setGame({ ...g2, seq: (g2.seq || 0) + 1 });

      // Phase 3: Resolve combat (after reveal flash finishes)
      setTimeout(() => {
        const g = { ...g2, bd: g2.bd.map(row => [...row]) };
        const aS = getEff(movingEnt.cd, g.bd, r, c, movingEnt.ib);
        const dS = getEff(setCell.cd, g.bd, r, c, setCell.ib);
        const result = resolveCombat(aS, dS, stat);
        const battleOpts = { atkCard: movingEnt.cd, defCard: setCell.cd, sub: `${stat.toUpperCase()} |${Math.abs(aS[stat])}| vs |${Math.abs(dS[stat])}|` };
        const aVal = Math.abs(aS[stat]); const dVal = Math.abs(dS[stat]);

        if (result.winner === "attacker") {
          g.bd[r][c] = { ...movingEnt, atk: (movingEnt.atk || 0) + 1 }; toPit(setCell.cd, or);
          combatC(g, result.dmg, result.winningStat, mr, battleOpts, movingEnt.cd, setCell.cd, true,
            `⚔ ${movingEnt.cd.name || "Atk"} |${aVal}| > ${setCell.cd.name || "Def"} |${dVal}| [${stat.toUpperCase()}]`, stat);
        } else if (result.winner === "defender") {
          g.bd[r][c] = { ...setCell, fd: false }; toPit(movingEnt.cd, mr);
          combatC(g, result.dmg, result.winningStat, or, battleOpts, movingEnt.cd, setCell.cd, false,
            `⚔ ${movingEnt.cd.name || "Atk"} |${aVal}| < ${setCell.cd.name || "Def"} |${dVal}| [${stat.toUpperCase()}]`, stat);
        } else {
          g.bd[r][c] = null;
          toPit(movingEnt.cd, mr); toPit(setCell.cd, or);
          playSfx(`battle-${stat[0]}`);
          enqF("⚔", { color: T.textDim, border: T.textDim, ...battleOpts, tie: true });
          addLog(`⚔ ${movingEnt.cd.name || "Atk"} |${aVal}| = ${setCell.cd.name || "Def"} |${dVal}| (tie) [${stat.toUpperCase()}]`);
        }
        checkFieldFreeings(g);
        g.act--;
        updateGame(g, { type: ACTION_TYPES.ATTACK, atkRow: sr, atkCol: sc, defRow: r, defCol: c, stat });
      }, 2000);
    }, 2000);
  }
  function endTurn() {
    if (!game || !isMyTurn() || aiR || placingRef.current) return;
    const g = { ...game, bd: game.bd.map(r => [...r]), aH: [...game.aH], aD: [...game.aD], pH: [...game.pH], pD: [...game.pD] };
    chkPresence(g);
    chkCenter(g);
    if (g.ph === "over") { updateGame(g, { type: ACTION_TYPES.END_TURN }); clr(); return; }
    const nextTurn = game.turn === "player" ? "ai" : "player";

    g.turn = nextTurn; g.act = actionsPerTurn; g.flips = 0; g.c0 = g.c;

    // Auto-draw for next player (reshuffle pit if deck empty)
    const ndk = nextTurn === "player" ? "pD" : "aD";
    const nhk = nextTurn === "player" ? "pH" : "aH";
    if (!g[ndk].length) reshufflePit(g, nextTurn);
    if (g[ndk].length) { g[nhk].push(g[ndk].shift()); playSfx("draw"); }

    flipSets(g, nextTurn); g.tn++;

    if (mMode) {
      updateGame(g, { type: ACTION_TYPES.END_TURN }); clr();
      addLog(`— ${nextTurn === curR ? "Your" : "Opp"} Turn —`);
    } else {
      setGame(g); clr(); addLog("— Opp —"); setAiR(true); setTimeout(() => runAI(g, 0), 600 + fx.PACE.beat);
    }
  }
  // Keep endTurnRef current so the auto-advance effect always calls the latest version
  endTurnRef.current = endTurn;

  function saveGameLog(g) {
    if (!DEV) return; // game logs go to the local backend
    const payload = {
      version: 1,
      startedAt: gameStartRef.current ? new Date(gameStartRef.current).toISOString() : null,
      endedAt: new Date().toISOString(),
      winner: g?.win ?? null,
      pRole: g?.pRole ?? null,
      finalConsciousness: g?.c ?? null,
      turns: g?.tn ?? null,
      multiplayer: mMode,
      first: (m => m?.startsWith("0C.") ? (m.includes("Opponent") ? "ai" : "player") : null)(narrativeRef.current[0]?.m),
      actions: actionTrailRef.current,
      narrative: narrativeRef.current.filter(e => e.t >= (gameStartRef.current || 0)).map(e => e.m),
    };
    fetch("http://localhost:33333/api/game-log", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(e => console.warn("[Trinity] Game log save failed:", e.message));
  }


  // Refresh image list from server
  async function refreshImages() {
    try { const r = await fetch(`${API}/images/list`); if (r.ok) setAllImages(await r.json()); } catch {}
  }

  // Forge / import
  async function handleImg(e) {
    const f = e.target.files[0]; if (!f) return;
    const path = await uploadFile(f);
    if (path) { setNc(p => ({ ...p, image: path })); refreshImages(); }
  }
  async function handleBulk(e) {
    const files = Array.from(e.target.files);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = await uploadFile(f);
      if (path) {
        setCardPool(p => [...p, {
          id: "imp_" + Date.now() + "_" + i, name: "", type: "being",
          soul: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          mind: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          will: Math.floor(Math.random() * (STAT_MAX - STAT_MIN + 1)) + STAT_MIN,
          rarity: ["common", "common", "uncommon", "rare"][Math.floor(Math.random() * 4)],
          gradient: DG.being, image: path, set: nc.set || "Imported"
        }]);
      }
    }
  }
  function createCard() {
    const id = "c_" + Date.now(); const card = { ...nc, id };
    if (!["being", "field", "equip"].includes(nc.type)) STAT_DEFS.forEach(s => { card[s.key] = 0; });
    setCardPool(p => [...p, card]); setNc(p => ({ ...p, name: "", image: null }));
  }
  function updateCard(id, updates) { setCardPool(p => p.map(c => c.id === id ? { ...c, ...updates } : c)); }
  function togSet(si, cid) {
    setSets(p => {
      const u = [...p]; const s = { ...u[si] };
      s.cardIds = s.cardIds.includes(cid) ? s.cardIds.filter(id => id !== cid) : [...s.cardIds, cid]; u[si] = s; return u;
    });
  }
  function ripPack(setObj) {
    const cost = setObj.cost_per_pack ?? PACK_COST;
    if (tokens < cost) return;
    playSfx("pack");
    const sc = cardPool.filter(c => setObj.cardIds.includes(c.id) && c.image); if (!sc.length) return;
    setTokens(t => t - cost);
    const pack = [];
    for (let i = 0; i < CARDS_PER_PACK; i++) {
      let totalW = 0; for (const c of sc) totalW += c.weight || 100;
      let roll = Math.random() * totalW; let pick = sc[0];
      for (const c of sc) { roll -= (c.weight || 100); if (roll <= 0) { pick = c; break; } }
      pack.push(pick);
    }
    setColl(prev => { const n = { ...prev }; pack.forEach(c => { n[c.id] = (n[c.id] || 0) + 1; }); return n; });
    setPackRes(pack); setPackFlip(pack.map(() => false)); setPackSp(pack.map(c => c.rarity === "legendary"));
    setTokenFlash(true); setTimeout(() => setTokenFlash(false), 700);
  }

  function generateSet() {
    const { newCards, setEntry } = generateSetCards(gen, genImages, genMode, genSeed, cardPool);
    setCardPool(prev => [...prev, ...newCards]);
    setSets(prev => [...prev, setEntry]);
    setGen(p => ({ ...p, color: randSetColor() }));
    enqF("SET GENERATED", { color: T.silverBright, border: T.silver, icon: "◈", sub: `${newCards.length} cards: ${gen.name}` });
    return newCards.length;
  }

  // ═══ CAMPAIGN GENERATOR ═══
  function generateCampaign() {
    const { allNewCards, allSets, oldCardIds } = generateCampaignCards(camGen, camSeed, cardPool, sets, CAMPAIGN_SET_IDS);
    setCardPool(prev => [...prev.filter(c => !oldCardIds.has(c.id)), ...allNewCards]);
    setSets(allSets);
    enqF("CAMPAIGN GENERATED", { color: T.legendary, border: T.legendary + "80", icon: "✦", sub: `${allNewCards.length} cards · ${CAMPAIGN_SET_IDS.length} sets` });
  }

  const owned = id => FREE_POOL ? MAX_COPIES : (coll[id] || 0);
  const isH = (r, c) => hl.some(([hr, hc]) => hr === r && hc === c);
  const isWrapH = (r, c) => hl.some(([hr, hc, w]) => w && hr === r && hc === c);

  const tabs = [["play", "Play"], ["duel", "Duel"], ["browse", "Codex"], ["decks", "Decks"], ["packs", "Packs"], ["create", "Forge"], ["editor", "Editor"], ["rules", "Rules"]].filter(([id]) => tabLive(id));

  function generateStructureDecks() {
    const newDecks = genStructureDecks({ autoGenCfg, cardPool, existingDeckCount: decks.length, maxCopies: MAX_COPIES });
    setDecks(p => [...p, ...newDecks]);
  }

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: T.bg, color: T.text, fontFamily: FONT_BODY, display: "flex", flexDirection: "column" }}>
      <Flash flash={flash} boardRef={boardRef} slamAnim={slamAnim} cinemaMode={cinemaMode} cinemaRef={cinemaRef} cinemaSwap={cinemaSwap} />
      {loading && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000, background: T.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 20
        }}>
          <div style={{ fontFamily: FONT_TITLE, fontSize: 40, color: T.white, letterSpacing: 8, animation: "pulse 2s infinite" }}>TRINITY</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 10, color: T.silver, letterSpacing: 4 }}>LOADING STATE...</div>
        </div>
      )}
      {showTitle && <TitleScreen onStart={dismissTitle} cards={cardPool} />}
      {DEV && <MusicPlayer links={musicLinks} on={settings.musicOn && !loading} volume={settings.musicVolume} onTitle={setMusicTitle} />}
      <header style={{ background: T.bg2, borderBottom: `1px solid ${T.panelBorder}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 15, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_TITLE, fontSize: 32, color: T.white, lineHeight: 1 }}>Trinity</span>
        <div style={{ width: 1, height: 24, background: T.panelBorder }} />
        <nav style={{ display: "flex", gap: 3 }}>
          {tabs.map(([id, l]) => (
            <button key={id} onClick={() => { setTab(id); if (id !== "duel" && !game) setMMode(false); }} style={{
              padding: "4px 12px", background: tab === id ? T.white + "08" : "transparent",
              border: `1px solid ${tab === id ? T.silverDim : "transparent"}`, borderRadius: 2, cursor: "pointer",
              color: tab === id ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 10, letterSpacing: 2.5,
              textTransform: "uppercase", fontWeight: tab === id ? 900 : 500
            }}>{l}</button>))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setMuted(!muted)} style={{
            background: "none", border: "none", cursor: "pointer", color: muted ? T.danger : T.silverBright,
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8
          }}>
            <span style={{ fontSize: 14 }}>{muted ? "🔇" : "🔊"}</span>
          </button>
          {DEV && <button onClick={() => hasMusic ? setSettings(s => ({ ...s, musicOn: !s.musicOn })) : setShowSettings(true)}
            title={!hasMusic ? "Add YouTube links to music-links.txt or Settings → Music" : settings.musicOn ? (musicTitle ? `♪ ${musicTitle}` : "Music on") : "Music off"} style={{
            background: "none", border: "none", cursor: "pointer", color: T.silverBright,
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center", opacity: hasMusic && settings.musicOn ? 0.8 : 0.45, position: "relative"
          }}>
            <span style={{ fontSize: 14 }}>🎵</span>
            {!(hasMusic && settings.musicOn) && <span style={{ position: "absolute", right: 0, bottom: 0, fontSize: 9, fontWeight: 900, color: T.danger, lineHeight: 1 }}>✕</span>}
          </button>}
          <button onClick={() => setShowSettings(true)} style={{
            background: "none", border: "none", cursor: "pointer", color: T.silverBright,
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8
          }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>⚙</span>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: (tab === "play" || tab === "duel") && game ? "hidden" : "auto", padding: (tab === "play" || tab === "duel") ? "12px 20px" : "6px 10px", ...(cinemaMode && game ? { [cinemaSwap ? "marginRight" : "marginLeft"]: 370, maxWidth: "none", width: "calc(100% - 370px)" } : { maxWidth: 1100, margin: "0 auto", width: "100%" }), minHeight: 0 }}>

        {/* Play lobby (Original AI) */}
        {tab === "play" && !game && (
          <PlayLobby decks={decks} cardPool={cardPool} selDI={selDI} setSelDI={setSelDI} oppDI={oppDI} setOppDI={setOppDI}
            startGame={startGame} playSfx={playSfx} deckRules={deckRules} />
        )}

        {/* Duel Lobby (Multiplayer) */}
        {tabLive("duel") && tab === "duel" && !game && (
          <DuelLobby decks={decks} cardPool={cardPool} selDI={selDI} setSelDI={setSelDI} oppDI={oppDI} setOppDI={setOppDI}
            startGame={startGame} playSfx={playSfx} deckRules={deckRules} ws={ws} mRole={mRole} mTaken={mTaken}
            mAlias={mAlias} setMAlias={setMAlias} mOppAlias={mOppAlias} mOppDeck={mOppDeck} mWait={mWait} />
        )}

        {/* Play/Duel game board */}
        {(tab === "play" || tab === "duel") && game && (
          <DuelBoard game={game} setGame={setGame} curR={curR} isMyTurn={isMyTurn} jp={jp} locale={locale} t={t}
            mode={mode} selB={selB} tapTgt={tapTgt} aiR={aiR} logRef={logRef}
            showPit={showPit} setShowPit={setShowPit} selH={selH} selectHand={selectHand}
            boardClick={boardClick} isH={isH} isWrapH={isWrapH} clr={clr}
            drawCard={drawCard} endTurn={endTurn} forfeit={forfeit} playBC={playBC} resolveTap={resolveTap}
            doSetTrap={doSetTrap} doSetEquip={doSetEquip} doSetField={doSetField} doSetBeing={doSetBeing}
            log={log} setLog={setLog} setActionLog={setActionLog} pit={pit} recentPit={recentPit}
            eqFlash={eqFlash} inspCell={inspCell} setInspCell={setInspCell}
            boardRef={boardRef} cinemaRef={cinemaRef} cinemaMode={cinemaMode} cinemaSwap={cinemaSwap}
            C_MAX={C_MAX} TURN_CAP={TURN_CAP} actionsPerTurn={actionsPerTurn} BEING_SET_ENABLED={BEING_SET_ENABLED}
            TRIBUTE_SUMMON_ENABLED={TRIBUTE_SUMMON_ENABLED} aiCue={aiCue} noAnim={settings.noAnim} />
        )}

        {/* ═══ FORGE ═══ */}
        {tabLive("create") && tab === "create" && (
          <ForgeTab sets={sets} decks={decks} setDecks={setDecks} cardPool={cardPool}
            allImages={allImages} uploadFile={uploadFile} handleImg={handleImg} createCard={createCard}
            forgeMode={forgeMode} setForgeMode={setForgeMode} forgeImgSize={forgeImgSize} setForgeImgSize={setForgeImgSize}
            nc={nc} setNc={setNc} gen={gen} setGen={setGen} genMode={genMode} setGenMode={setGenMode}
            genSeed={genSeed} setGenSeed={setGenSeed} genImages={genImages} setGenImages={setGenImages}
            camGen={camGen} setCamGen={setCamGen} camSeed={camSeed} setCamSeed={setCamSeed}
            autoGenCfg={autoGenCfg} setAutoGenCfg={setAutoGenCfg}
            livePreview={livePreview} campaignPreview={campaignPreview} dragRef={dragRef}
            generateSet={generateSet} generateCampaign={generateCampaign} generateStructureDecks={generateStructureDecks}
            simulating={simulating} setSimulating={setSimulating} />
        )}

        {/* ═══ DECKS ═══ */}
        <DecksTab visible={tab === "decks"} decks={decks} setDecks={setDecks} cardMap={cardMap}
          owned={owned} ownedCardPool={ownedCardPool} DECK_SIZE={DECK_SIZE} MAX_COPIES={MAX_COPIES}
          spellBudget={spellBudget} />

        {/* ═══ CODEX ═══ */}
        <CodexTab visible={tab === "browse"} cardPool={cardPool} cardSetMap={cardSetMap}
          sets={sets} owned={owned} togSet={togSet} updateCard={updateCard} readOnly={!DEV} />

        {/* ═══ PACKS — no rarity sliders, just pick set & rip ═══ */}
        {tabLive("packs") && tab === "packs" && (
          <PacksTab sets={sets} selSI={selSI} setSelSI={setSelSI} tokens={tokens} tokenFlash={tokenFlash}
            ripPack={ripPack} packRes={packRes} setPackRes={setPackRes} packFlip={packFlip} setPackFlip={setPackFlip}
            packSp={packSp} setPackSp={setPackSp} PACK_COST={PACK_COST} />
        )}

        {/* ═══ EDITOR — filterable, sortable, with image upload ═══ */}
        {tabLive("editor") && <EditorTab visible={tab === "editor"} cardPool={cardPool} setCardPool={setCardPool}
          cardSetMap={cardSetMap} sets={sets} setSets={setSets} allImages={allImages}
          forgeImgSize={forgeImgSize} setForgeImgSize={setForgeImgSize} owned={owned}
          togSet={togSet} updateCard={updateCard} uploadFile={uploadFile} refreshImages={refreshImages} />}

        {/* ═══ RULES — illustrated rulebook, follows live settings ═══ */}
        {tab === "rules" && <RulesTab settings={settings} cardPool={cardPool} freePool={FREE_POOL} />}
      </main>

      {showSettings && <SettingsModal settings={settings} setSettings={setSettings} showMusic={DEV} showEconomy={tabLive("packs")} defaults={baseSettings} localMusicCount={parseYouTubeIds(localMusicLinks).length} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
