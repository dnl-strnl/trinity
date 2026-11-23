import { FONT_TITLE, FONT_UI, THEME as T } from "../theme.js";
import { getDeckMagnitude, validateDeck } from "../gameUtils.js";

// Legality notes for the two selected decks — errors block the start button, warnings don't
export function DeckIssues({ decks, cardPool, selDI, oppDI, deckRules }) {
  const rows = [selDI, oppDI].map(i => decks[i]).filter(Boolean)
    .map(d => ({ name: d.name, ...validateDeck(d, cardPool, deckRules) }))
    .filter(v => v.errors.length || v.warnings.length);
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: 10, fontFamily: FONT_UI, fontSize: 7, letterSpacing: 1 }}>
      {rows.map(v => (
        <div key={v.name} style={{ color: v.errors.length ? T.danger : T.textDim }}>
          {v.name}: {v.errors.length ? `not legal — ${v.errors.join(", ")}` : v.warnings.join(", ")}
        </div>
      ))}
    </div>
  );
}

export default function PlayLobby({ decks, cardPool, selDI, setSelDI, oppDI, setOppDI, startGame, playSfx, deckRules }) {
  const legal = [selDI, oppDI].every(i => !validateDeck(decks[i], cardPool, deckRules).errors.length);
  return (
          <div style={{ textAlign: "center", padding: "24px 16px", animation: "fadeIn .5s", zoom: 1.5 }}>
            <div style={{ fontFamily: FONT_TITLE, fontSize: 48, color: T.white, lineHeight: 1 }}>Trinity</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 8, color: T.silverDim, letterSpacing: 7, marginTop: 2, marginBottom: 18, fontWeight: 600 }}>THE WAR IN HEAVEN</div>
            <div style={{ maxWidth: 450, margin: "0 auto 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
              {[["GOOD", selDI, setSelDI, T.silverBright], ["EVIL", oppDI, setOppDI, T.curse]].map(([lb, sel, setSel, col], sideIdx) => {
                const isEvil = sideIdx === 1;
                const pMag = getDeckMagnitude(decks[selDI], cardPool);
                return (
                  <div key={lb} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 2, marginBottom: 3, fontWeight: 700 }}>{lb}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {decks.map((d, i) => {
                        const mag = getDeckMagnitude(d, cardPool);
                        let disabled = false;
                        if (isEvil) {
                          if (pMag > 0 && mag > 0) disabled = true;
                          if (pMag < 0 && mag < 0) disabled = true;
                        }
                        return (
                          <button key={i} onClick={() => {
                            playSfx("select");
                            setSel(i);
                            if (!isEvil) {
                              const nextPMag = getDeckMagnitude(d, cardPool);
                              const oppMag = getDeckMagnitude(decks[oppDI], cardPool);
                              if ((nextPMag > 0 && oppMag > 0) || (nextPMag < 0 && oppMag < 0)) {
                                const compat = decks.findIndex((dk, idx) => {
                                  const m = getDeckMagnitude(dk, cardPool);
                                  return nextPMag > 0 ? m <= 0 : m >= 0;
                                });
                                if (compat !== -1) setOppDI(compat);
                              }
                            }
                          }} style={{
                            padding: "6px 10px", background: sel === i ? col + "14" : T.panel,
                            border: `1px solid ${sel === i ? col : T.panelBorder}`, borderRadius: 2,
                            cursor: "pointer", color: sel === i ? col : T.textDim, fontFamily: FONT_UI,
                            fontSize: 8, fontWeight: 700, textAlign: "left",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            opacity: disabled ? 0.35 : 1, transition: "all .2s"
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
            <DeckIssues decks={decks} cardPool={cardPool} selDI={selDI} oppDI={oppDI} deckRules={deckRules} />
            <button onClick={startGame} disabled={!legal} style={{
              padding: "6px 32px", background: "transparent", border: `1.5px solid ${T.silverBright}`, borderRadius: 2,
              cursor: legal ? "pointer" : "default", fontFamily: FONT_TITLE, fontSize: 16, color: T.white, letterSpacing: 4,
              opacity: legal ? 1 : 0.4
            }}>Judgment</button>
          </div>
  );
}
