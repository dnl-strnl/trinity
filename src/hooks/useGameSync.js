import { useEffect, useCallback } from "react";
import { THEME as T } from "../theme.js";
import { tabLive } from "../release.js";

// Multiplayer sync: owns the WebSocket connection (connect / reconnect / inbound
// message handling) plus the two outbound sync primitives. All multiplayer state
// and refs stay in Trinity and arrive via the deps bag; the mount-only effect
// captures the first-render instances, exactly as the original inline effect did.
export function useGameSync({
  ws, mRoleRef, mTakenRef, gameStartRef, mMode,
  setGame, setTab, setMMode, setMRole, setMTaken, setMAlias, setMOppAlias,
  setMOppDeck, setMWait, setActionLog, setSelDI, setOppDI,
  enqF, playSfx,
}) {
  useEffect(() => {
    if (!tabLive("duel")) return; // the duel server is local only
    let socket = null;
    let reconnectTimer = null;
    let attempt = 0;
    let disposed = false; // Prevents reconnect after StrictMode cleanup

    function connect() {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname || "localhost";
      const wsUrl = `${protocol}//${host}:33333/game-ws`;
      console.log("[Multiplayer] Connecting to:", wsUrl, "(attempt", attempt + 1, ")");

      socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("[Multiplayer] Connected!");
        attempt = 0;
        socket.send(JSON.stringify({ type: "join" }));
      };

      socket.onerror = (e) => {
        console.error("[Multiplayer] WebSocket Error:", e);
      };

      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "welcome") {
          console.log("[Multiplayer] Welcome! Role:", msg.role);
          mRoleRef.current = msg.role;
          setMRole(msg.role);
          setMTaken(msg.taken);
          mTakenRef.current = msg.taken;
          if (msg.state) setGame(msg.state);
          // Auto-assign a random icon, ensuring it differs from any already-taken alias
          if (msg.role !== "spectator") {
            const ICONS = ["📜", "🗝️", "🕯️", "🏺", "⏳", "🪔", "🪶"];
            const takenAliases = Object.values(msg.aliases || {});
            const pool = ICONS.filter(e => !takenAliases.includes(e));
            const autoAlias = (pool.length > 0 ? pool : ICONS)[Math.floor(Math.random() * (pool.length || ICONS.length))];
            setMAlias(autoAlias);
            socket.send(JSON.stringify({ type: "set_alias", role: msg.role, alias: autoAlias }));
          }
        } else if (msg.type === "room_update") {
          const prev = mTakenRef.current;
          const newJoiner = msg.taken.find(r => !prev.includes(r) && r !== mRoleRef.current);
          if (newJoiner) enqF("OPPONENT ENTERED", { color: T.silverBright, icon: "⚔️" });
          mTakenRef.current = msg.taken;
          setMTaken(msg.taken);
        } else if (msg.type === "deck_selected") {
          if (msg.role !== mRoleRef.current) {
            setMOppDeck(msg.deck_name);
            if (msg.role === "p1") setSelDI(msg.deck_idx);
            else if (msg.role === "p2") setOppDI(msg.deck_idx);
          }
        } else if (msg.type === "ready_to_start") {
          setMWait(false);
        } else if (msg.type === "alias_update") {
          if (msg.role !== mRoleRef.current) setMOppAlias(msg.alias || null);
        } else if (msg.type === "game_start") {
          setGame(msg.state);
          setActionLog([]); gameStartRef.current = Date.now();
          setMMode(true);
          setMWait(false);
          setTab("duel");
          enqF("BATTLE START", { color: T.silverBright, icon: "⚔" });
        } else if (msg.type === "state_update") {
          // Only apply if at least as new as our current state (prevents stale echo)
          setGame(prev => (!prev || !msg.state?.seq || msg.state.seq >= (prev.seq || 0)) ? msg.state : prev);
        } else if (msg.type === "game_action") {
          // Opponent took an action: log it and apply the pre-computed result
          if (msg.action) {
            setActionLog(prev => [...prev.slice(-199), { ...msg.action, seq: msg.seq || 0, ts: Date.now(), remote: true }]);
          }
          if (msg.state) {
            const act = msg.action?.type;
            if ((act === "SUMMON" || act === "TERRAIN") && msg.action?.row !== undefined) {
              // Show animation first, then place entity as it fades — mirrors sender timing
              const { row, col } = msg.action;
              const interim = { ...msg.state, bd: msg.state.bd.map((r, ri) => r.map((cell, ci) => ri === row && ci === col ? null : cell)) };
              setGame(prev => (!prev || interim.seq >= (prev.seq || 0)) ? interim : prev);
              setTimeout(() => setGame(prev => (!prev || msg.state.seq >= (prev.seq || 0)) ? msg.state : prev), 1100);
            } else {
              setGame(prev => (!prev || msg.state.seq >= (prev.seq || 0)) ? msg.state : prev);
            }
          }
        } else if (msg.type === "sync_anim") {
          if (msg.sender !== mRoleRef.current && msg.flash) {
            enqF(msg.flash.text, msg.flash.opts);
          }
        } else if (msg.type === "sync_sfx") {
          if (msg.sender !== mRoleRef.current && msg.sound) {
            playSfx(msg.sound, true);
          }
        } else if (msg.type === "game_reset") {
          setGame(null);
          setMMode(false);
          setMOppDeck(null);
          setMOppAlias(null);
          setMWait(false);
        }
      };

      socket.onclose = (e) => {
        console.log("[Multiplayer] Connection closed:", e.code, e.reason);
        if (!disposed) {
          // Auto-reconnect with backoff (max 10s)
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          attempt++;
          console.log("[Multiplayer] Reconnecting in", delay, "ms...");
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      console.log("[Multiplayer] Cleaning up WebSocket");
      disposed = true; // Stop any further reconnections
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []); // Run only ONCE on mount — eslint-disable-line react-hooks/exhaustive-deps

  const syncState = useCallback((nextGame) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "sync_state", state: nextGame }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // updateGame: the single path for all game state mutations.
  // Pass actionMeta = { type: ACTION_TYPES.X, ...payload } to use action-based sync.
  // Falls back to full-state sync if no action meta is provided.
  const updateGame = useCallback((next, actionMeta = null) => {
    const withSeq = { ...next, seq: (next.seq || 0) + 1 };
    setGame(withSeq);
    if (actionMeta) {
      // Always log — single player AND multiplayer
      setActionLog(prev => [...prev.slice(-499), {
        ...actionMeta, seq: withSeq.seq, ts: Date.now(), c: withSeq.c, tn: withSeq.tn,
      }]);
    }
    if (mMode && ws.current?.readyState === WebSocket.OPEN) {
      if (actionMeta) {
        ws.current.send(JSON.stringify({ type: "game_action", action: actionMeta, state: withSeq, seq: withSeq.seq }));
      } else {
        syncState(withSeq);
      }
    }
  }, [mMode, syncState]); // eslint-disable-line react-hooks/exhaustive-deps

  return { syncState, updateGame };
}
