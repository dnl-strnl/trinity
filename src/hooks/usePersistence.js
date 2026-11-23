import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, mergeSettings } from "../gameUtils.js";
import { DEV, artUrl } from "../release.js";

const API = "/api";
const LIVE_KEY = "trinity:v1"; // localStorage: { decks, settings }

// The live build has no backend. It ships a snapshot of backend/data (card pool, starter decks, sets, settings)
// and keeps only what the player makes — their own decks and their changed settings — in the browser.
async function loadLive() {
  const [cards, decks, sets, settings] = (await Promise.all([
    import("../../backend/data/cards.json"), import("../../backend/data/decks.json"),
    import("../../backend/data/sets.json"), import("../../backend/data/settings.json"),
  ])).map(m => m.default);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LIVE_KEY)) || {}; } catch { /* unreadable or blocked storage: start fresh */ }
  return { cards, decks, sets, settings, saved };
}

// Persistence: initial state load, then saves. Local dev talks to the backend (two debounced PUTs — cards: 2s,
// everything else: 800ms); the live build uses loadLive and localStorage. Also exposes the uploadFile helper.
// Returns baseSettings: the settings "Reset to defaults" goes back to.
export function usePersistence({
  dbR, setDbR, setLoading,
  cardPool, setCardPool, decks, setDecks, coll, setColl, sets, setSets,
  tokens, setTokens, settings, setSettings, setAudioEnabled,
}) {
  const [baseSettings, setBaseSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    (async () => {
      if (!DEV) {
        try {
          const s = await loadLive();
          const base = mergeSettings({ ...s.settings, musicLinks: "" });
          setCardPool(s.cards.map(c => ({ ...c, image: artUrl(c.image) })));
          setSets(s.sets);
          setDecks([...s.decks.map(d => ({ ...d, locked: true })), ...(Array.isArray(s.saved.decks) ? s.saved.decks : [])]);
          setBaseSettings(base);
          setSettings({ ...base, ...(s.saved.settings || {}) });
          setDbR(true); // saving starts only after a good load, so a failed one can't wipe the player's decks
        } catch (e) { console.error("[Trinity] Could not load game data:", e); }
        setLoading(false);
        return;
      }
      try {
        console.log("[Trinity] Loading state from backend...");
        const r = await fetch(`${API}/state`);
        if (r.ok) {
          const s = await r.json();
          if (s.cards) setCardPool(s.cards);
          if (s.decks) setDecks(s.decks);
          if (s.collection) setColl(s.collection);
          if (s.sets) setSets(s.sets);
          if (s.tokens !== undefined) setTokens(s.tokens);
          if (s.audio_enabled !== undefined) setAudioEnabled(s.audio_enabled);
          if (s.settings) setSettings(mergeSettings(s.settings));
          console.log(`[Trinity] Loaded state from backend`);
        } else { console.warn("[Trinity] Backend returned", r.status); }
      } catch (e) { console.warn("[Trinity] Backend not reachable:", e.message); }
      setDbR(true);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: the player's own decks, and only the settings they changed, so later releases can move the defaults
  useEffect(() => {
    if (DEV || !dbR) return;
    const changed = Object.fromEntries(Object.entries(settings).filter(([k, v]) => v !== baseSettings[k]));
    try { localStorage.setItem(LIVE_KEY, JSON.stringify({ decks: decks.filter(d => !d.locked), settings: changed })); } catch { /* storage full or blocked */ }
  }, [decks, settings, baseSettings, dbR]);

  const cardSaveTimer = useRef(null);
  useEffect(() => {
    if (!DEV || !dbR) return;
    clearTimeout(cardSaveTimer.current);
    cardSaveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/cards`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cardPool),
        });
        if (r.ok) console.log("[Trinity] Cards saved OK");
        else console.error("[Trinity] Cards save failed:", r.status, await r.text());
      } catch (e) { console.warn("[Trinity] Cards save failed:", e.message); }
    }, 2000);
  }, [cardPool, dbR]);

  const stateSaveTimer = useRef(null);
  useEffect(() => {
    if (!DEV || !dbR) return;
    clearTimeout(stateSaveTimer.current);
    stateSaveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decks, sets, collection: coll, tokens, settings }),
        });
        if (r.ok) console.log("[Trinity] State saved OK");
        else console.error("[Trinity] State save failed:", r.status, await r.text());
      } catch (e) { console.warn("[Trinity] State save failed:", e.message); }
    }, 800);
  }, [decks, sets, coll, tokens, settings, dbR]);

  return { baseSettings };
}

export async function uploadFile(f, type = "image") {
  if (type === "image") {
    try {
      const check = await fetch(`${API}/images/exists?filename=${encodeURIComponent(f.name)}`);
      if (check.ok) {
        const { exists, path } = await check.json();
        if (exists) return path; // already in public/images — just assign
        if (!window.confirm(`"${f.name}" is not in public/images yet. Upload it now?`)) return null;
        // Confirmed new upload — preserve original filename so it's reusable
        const fd = new FormData(); fd.append("file", f); fd.append("use_original_name", "true");
        const r = await fetch(`${API}/upload/image`, { method: "POST", body: fd });
        if (r.ok) { const d = await r.json(); return d.path; }
        return null;
      }
    } catch (e) { console.error("Image check failed", e); }
  }
  const fd = new FormData(); fd.append("file", f);
  try {
    const r = await fetch(`${API}/upload/${type}`, { method: "POST", body: fd });
    if (r.ok) { const d = await r.json(); return d.path; }
  } catch (e) { console.error("Upload failed", e); }
  return null;
}
