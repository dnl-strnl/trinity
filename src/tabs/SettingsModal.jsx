import { FONT_UI, THEME as T, B, LBL, INP } from "../theme.js";
import { DEFAULT_SETTINGS } from "../gameUtils.js";

export default function SettingsModal({ settings, setSettings, showMusic, showEconomy, defaults = DEFAULT_SETTINGS, localMusicCount, onClose }) {
  const jp = settings.locale === "jp";
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "#00000088", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 6,
        padding: "18px 22px", minWidth: 320, maxWidth: 400, maxHeight: "80vh",
        overflowY: "auto", position: "relative"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 11, letterSpacing: 3, color: T.silverBright, fontWeight: 700 }}>⚙ SETTINGS</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>

        <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginBottom: 8 }}>GAME</div>
        {[["Consciousness to win", "cMax", 1, 20], ["Actions per turn", "actionsPerTurn", 1, 10], ["Hand size", "handSize", 1, 20], ["Max C per turn (0 = no cap)", "turnCap", 0, 20], ["Max C per combat (0 = no cap)", "combatCap", 0, 10], ["Attacks per being (0 = no limit)", "attacksPerBeing", 0, 3]].map(([lbl, key, mn, mx]) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>{lbl}</span>
            <input type="number" min={mn} max={mx} value={settings[key]}
              onChange={e => setSettings(s => ({ ...s, [key]: Math.max(mn, Math.min(mx, parseInt(e.target.value) || mn)) }))}
              style={{ ...INP, width: 60, textAlign: "center" }} />
          </div>
        ))}

        <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginTop: 10, marginBottom: 8 }}>DECK</div>
        {[["Deck size", "deckSize", 10, 60], ["Max copies", "maxCopies", 1, 4], ["Spell budget", "spellBudget", 1, 30]].map(([lbl, key, mn, mx]) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>{lbl}</span>
            <input type="number" min={mn} max={mx} value={settings[key]}
              onChange={e => setSettings(s => ({ ...s, [key]: Math.max(mn, Math.min(mx, parseInt(e.target.value) || mn)) }))}
              style={{ ...INP, width: 60, textAlign: "center" }} />
          </div>
        ))}

        {showEconomy && <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginTop: 10, marginBottom: 8 }}>ECONOMY</div>}
        {showEconomy && [["Starting tokens", "tokensStart", 0, 20], ["Tokens per win", "tokensPerWin", 0, 10], ["Pack cost", "packCost", 0, 10], ["Cards per pack", "cardsPerPack", 1, 10]].map(([lbl, key, mn, mx]) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>{lbl}</span>
            <input type="number" min={mn} max={mx} value={settings[key]}
              onChange={e => setSettings(s => ({ ...s, [key]: Math.max(mn, Math.min(mx, parseInt(e.target.value) || mn)) }))}
              style={{ ...INP, width: 60, textAlign: "center" }} />
          </div>
        ))}

        <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginTop: 10, marginBottom: 8 }}>MECHANICS</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Tribute summon</span>
          <button onClick={() => setSettings(s => ({ ...s, tributeSummonEnabled: !s.tributeSummonEnabled }))}
            style={{ ...B(settings.tributeSummonEnabled ? T.silverBright : T.textDim), padding: "3px 10px", fontSize: 9 }}>
            {settings.tributeSummonEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Being set</span>
          <button onClick={() => setSettings(s => ({ ...s, beingSetEnabled: !s.beingSetEnabled }))}
            style={{ ...B(settings.beingSetEnabled ? T.silverBright : T.textDim), padding: "3px 10px", fontSize: 9 }}>
            {settings.beingSetEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Presence</span>
          <button onClick={() => setSettings(s => ({ ...s, presenceEnabled: !s.presenceEnabled }))}
            style={{ ...B(settings.presenceEnabled ? T.silverBright : T.textDim), padding: "3px 10px", fontSize: 9 }}>
            {settings.presenceEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>King of the hill</span>
          <button onClick={() => setSettings(s => ({ ...s, kingOfTheHillEnabled: !s.kingOfTheHillEnabled }))}
            style={{ ...B(settings.kingOfTheHillEnabled ? T.silverBright : T.textDim), padding: "3px 10px", fontSize: 9 }}>
            {settings.kingOfTheHillEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Zero-aura edge attacks</span>
          <button onClick={() => setSettings(s => ({ ...s, edgeWrap: s.edgeWrap === "full" ? "straight" : s.edgeWrap === "straight" ? "off" : "full" }))}
            style={{ ...B(settings.edgeWrap === "full" || settings.edgeWrap === "straight" ? T.silverBright : T.textDim), padding: "3px 10px", fontSize: 9 }}>
            {settings.edgeWrap === "full" ? "ALL 8" : settings.edgeWrap === "straight" ? "STRAIGHT" : "OFF"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Animation style</span>
          <button onClick={() => setSettings(s => {
            if (s.noAnim) return { ...s, noAnim: false, slamAnim: true, cinemaMode: false }; // OFF → Theatre
            if (s.slamAnim && !s.cinemaMode) return { ...s, slamAnim: false, cinemaMode: true }; // Theatre → Cinema
            if (s.cinemaMode) return { ...s, slamAnim: false, cinemaMode: false }; // Cinema → Classic
            return { ...s, noAnim: true, slamAnim: false, cinemaMode: false }; // Classic → OFF
          })}
            style={{ ...B(settings.noAnim ? T.textDim : settings.cinemaMode ? "#6090c0" : T.silver), padding: "3px 10px", fontSize: 9 }}>
            {settings.noAnim ? "OFF" : settings.cinemaMode ? "CINEMA" : settings.slamAnim ? "THEATRE" : "CLASSIC"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Opponent pace</span>
          <button onClick={() => setSettings(s => ({ ...s, pace: s.pace === "relaxed" ? "normal" : s.pace === "brisk" ? "relaxed" : "brisk" }))}
            style={{ ...B(settings.pace === "brisk" ? T.textDim : T.silver), padding: "3px 10px", fontSize: 9 }}>
            {(settings.pace || "normal").toUpperCase()}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Controls side</span>
          <button onClick={() => setSettings(s => ({ ...s, cinemaSwap: !s.cinemaSwap }))}
            style={{ ...B(T.silver), padding: "3px 10px", fontSize: 9 }}>
            {settings.cinemaSwap ? "LEFT" : "RIGHT"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Locale</span>
          <button onClick={() => setSettings(s => ({ ...s, locale: s.locale === "en" ? "jp" : "en" }))}
            style={{ ...B(jp ? "#c060a0" : T.textDim), padding: "3px 10px", fontSize: 9 }}>
            {jp ? "JP" : "EN"}
          </button>
        </div>

        {showMusic && <>
          <div style={{ ...LBL, color: T.silverDim, borderBottom: `1px solid ${T.panelBorder}`, paddingBottom: 2, marginTop: 10, marginBottom: 8 }}>MUSIC</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1, marginBottom: 4 }}>YouTube links, one per line — loops in order</div>
          <textarea value={settings.musicLinks} onChange={e => setSettings(s => ({ ...s, musicLinks: e.target.value }))} rows={4}
            placeholder={localMusicCount ? `Empty: playing music-links.txt (${localMusicCount} track${localMusicCount === 1 ? "" : "s"})` : "https://www.youtube.com/watch?v=…"} spellCheck={false}
            style={{ ...INP, width: "100%", boxSizing: "border-box", resize: "vertical", fontSize: 10, marginBottom: 6 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 9, color: T.text, letterSpacing: 1 }}>Music volume</span>
            <input type="range" min={0} max={100} value={settings.musicVolume}
              onChange={e => setSettings(s => ({ ...s, musicVolume: parseInt(e.target.value) }))} style={{ width: 120, accentColor: T.silver }} />
          </div>
        </>}

        <div style={{ borderTop: `1px solid ${T.panelBorder}`, marginTop: 14, paddingTop: 12, textAlign: "right" }}>
          <button onClick={() => setSettings(s => ({ ...defaults, musicLinks: s.musicLinks }))} style={{ ...B(T.textDim), fontSize: 9 }}>Reset to defaults</button>
        </div>
      </div>
    </div>
  );
}
