import { FONT_TITLE, FONT_UI, THEME as T } from "../theme.js";
import { getDeckMagnitude, validateDeck } from "../gameUtils.js";
import { DeckIssues } from "./PlayLobby.jsx";

export default function DuelLobby({
  decks, cardPool, selDI, setSelDI, oppDI, setOppDI, startGame, playSfx, deckRules, ws,
  mRole, mTaken, mAlias, setMAlias, mOppAlias, mOppDeck, mWait,
}) {
  const legal = [selDI, oppDI].every(i => !validateDeck(decks[i], cardPool, deckRules).errors.length);
  const blocked = mWait || !mRole || mRole === "spectator" || !legal;
  return (
          <div style={{ textAlign: "center", padding: "24px 16px", animation: "fadeIn .5s", zoom: 1.5 }}>
            <div style={{ fontFamily: FONT_TITLE, fontSize: 48, color: T.white, lineHeight: 1 }}>Duel</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 8, color: T.silverDim, letterSpacing: 7, marginTop: 2, marginBottom: 18, fontWeight: 600 }}>TWO HEAVENS UNITED</div>

            <div style={{ maxWidth: 450, margin: "0 auto 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
              {[["Us (GOOD)", selDI, setSelDI, T.silverBright, "p1"], ["Them (EVIL)", oppDI, setOppDI, T.curse, "p2"]].map(([lb, sel, setSel, col, role], sideIdx) => {
                const isTaken = mTaken.includes(role);
                const isMyRole = mRole === role;
                const showLock = isTaken && !isMyRole;

                return (
                  <div key={lb} style={{ display: "flex", flexDirection: "column", gap: 4, opacity: showLock ? 0.35 : 1, pointerEvents: showLock ? "none" : "auto" }}>
                    <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 2, marginBottom: 3, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                      <span>{lb}</span>
                      {isTaken && <span style={{ color: isMyRole ? T.bless : T.danger }}>
                        {isMyRole ? `${mAlias || ""} You` : `${mOppAlias || ""}`}
                      </span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {decks.map((d, i) => {
                        const mag = getDeckMagnitude(d, cardPool);
                        // Filter by polarity if needed, but in Duel we allow more freedom or can stick to constraints
                        const pMag = getDeckMagnitude(decks[selDI], cardPool);
                        let disabled = sideIdx === 1 && ((pMag > 0 && mag > 0) || (pMag < 0 && mag < 0));

                        return (
                          <button key={i} onClick={() => {
                            if (!isMyRole) return;
                            playSfx("select");
                            setSel(i);
                            if (ws.current?.readyState === WebSocket.OPEN) {
                              ws.current.send(JSON.stringify({ type: "select_deck", role, deck: d, deck_idx: i }));
                            }
                          }} style={{
                            padding: "6px 10px", background: sel === i ? col + "14" : T.panel,
                            border: `1px solid ${sel === i ? col : T.panelBorder}`, borderRadius: 2,
                            cursor: isMyRole ? "pointer" : "default", color: sel === i ? col : T.textDim, fontFamily: FONT_UI,
                            fontSize: 8, fontWeight: 700, textAlign: "left",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            opacity: (disabled || !isMyRole) && sel !== i ? 0.35 : 1, transition: "all .2s"
                          }}>
                            <span>{d.name}</span>
                            <span style={{ fontSize: 10, color: mag > 0 ? T.bless : mag < 0 ? T.curse : T.silver, opacity: 0.8 }}>
                              {mag > 0 ? "△" : mag < 0 ? "▽" : "✡"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {mOppDeck && <div style={{ marginBottom: 16, fontSize: 9, color: T.silver, fontFamily: FONT_UI }}>Opponent selected: <span style={{ color: T.white }}>{mOppDeck}</span></div>}

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <DeckIssues decks={decks} cardPool={cardPool} selDI={selDI} oppDI={oppDI} deckRules={deckRules} />
              <button onClick={startGame} disabled={blocked} style={{
                padding: "6px 32px", background: "transparent", border: `1.5px solid ${T.silverBright}`, borderRadius: 2,
                cursor: blocked ? "default" : "pointer", fontFamily: FONT_TITLE, fontSize: 16, color: T.white, letterSpacing: 4,
                opacity: blocked ? 0.4 : 1
              }}>
                {mWait ? "WAITING..." : "Reckoning"}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: mRole ? T.bless : T.danger }} />
                <div style={{ fontSize: 8, color: T.silverBright, fontFamily: FONT_UI, letterSpacing: 2 }}>
                  {mRole ? `STATUS: CONNECTED ${mRole === "p1" ? "FIRST" : mRole === "p2" ? "LAST" : mRole.toUpperCase()}` : "STATUS: CONNECTING..."}
                </div>
                <button onClick={() => {
                  if (confirm("Hard reset will kick ALL players and clear the game. Continue?")) {
                    ws.current?.send(JSON.stringify({ type: "reset", hard: true }));
                  }
                }} style={{
                  background: "transparent", border: `1px solid ${T.danger}`, color: T.danger, fontSize: 6, padding: "2px 6px", borderRadius: 2, cursor: "pointer", opacity: 0.6, marginLeft: 8
                }}>HARD RESET ROOM</button>
              </div>

              {/* Identity picker — override auto-assigned icon */}
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                  {["📜", "🗝️", "🕯️", "🏺", "⏳", "🪔", "🪶"].map(e => (
                    <button key={e} onClick={() => {
                      const next = mAlias === e ? null : e;
                      setMAlias(next);
                      if (ws.current?.readyState === WebSocket.OPEN && mRole && mRole !== "spectator") {
                        ws.current.send(JSON.stringify({ type: "set_alias", role: mRole, alias: next || "" }));
                      }
                    }} style={{
                      fontSize: 18, background: "none", border: `1.5px solid ${mAlias === e ? T.silverBright : "transparent"}`,
                      borderRadius: 6, padding: "2px 4px", cursor: "pointer", opacity: mAlias === e ? 1 : 0.35,
                      transition: "all .15s", lineHeight: 1.3,
                    }}>{e}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
  );
}
