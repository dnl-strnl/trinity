import { useState } from "react";
import { FONT_TITLE, FONT_UI, THEME as T, RARITY_ORDER as RO, STAT_DEFS, B, LBL, INP } from "../theme.js";
import { cPwr } from "../gameUtils.js";
import { renderStatFilter, Card } from "../components.jsx";

// One accent per deck tile, cycled by position: a stripe, a corner glow and the card count — never the whole tile
const DECK_ACCENTS = ["#ffd84d", "#8f80dc", "#3fd9c4", "#ff5fa2", "#5b8def", "#ff9a4d"];
// Extra accents only new decks draw on, so a seventh deck gets a colour of its own before any repeats
const SPARE_ACCENTS = ["#1f8f96", "#d8c8a0", "#b0506a"];
const deckAccent = (d, i) => d.color || DECK_ACCENTS[i % DECK_ACCENTS.length];
// A new deck takes the least-used accent; ties go to the one last seen longest ago, so neighbours don't match
const pickAccent = decks => {
  const used = decks.map(deckAccent);
  return [...DECK_ACCENTS, ...SPARE_ACCENTS]
    .map((col, order) => ({ col, order, n: used.filter(u => u === col).length, last: used.lastIndexOf(col) }))
    .sort((a, b) => a.n - b.n || a.last - b.last || a.order - b.order)[0].col;
};

export default function DecksTab({
  visible, decks, setDecks, cardMap, owned, ownedCardPool, DECK_SIZE, MAX_COPIES, spellBudget,
}) {
  const [editDeck, setEditDeck] = useState(null);
  const [hoverDeck, setHoverDeck] = useState(null);
  const [deckSortMode, setDeckSortMode] = useState("type"); // "type" or "rarity"
  const [deckStatF, setDeckStatF] = useState({ soul: null, mind: null, will: null });
  // The live build ships its starter decks locked: they can be played, viewed and copied, not changed
  const locked = !!decks[editDeck?.idx]?.locked;

  return (
        <div style={{ display: visible ? undefined : "none" }}>
          {!editDeck ? (<>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ fontFamily: FONT_UI, fontSize: 14, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>DECKS</h2>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setDecks(p => [...p, { name: "New Deck", cards: [], color: pickAccent(p) }]); setEditDeck({ idx: decks.length }); }} style={B(T.silverBright)}>+ New</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14, maxWidth: 1080, margin: "0 auto" }}>
              {decks.map((d, i) => {
                const col = deckAccent(d, i), hot = hoverDeck === i;
                return (
                <div key={i} onClick={() => setEditDeck({ idx: i })} onMouseEnter={() => setHoverDeck(i)} onMouseLeave={() => setHoverDeck(null)}
                  style={{ position: "relative", overflow: "hidden", minHeight: 150, padding: "22px 24px 18px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: `radial-gradient(circle at 0% 0%, ${col}${hot ? "20" : "10"}, transparent 60%), ${T.panel}`, border: `1px solid ${hot ? col + "88" : T.panelBorder}`, borderRadius: 4, cursor: "pointer", transition: "border-color .15s, transform .15s", transform: hot ? "translateY(-2px)" : "none" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: col, opacity: hot ? 1 : 0.7 }} />
                  {!d.locked && <button onClick={e => { e.stopPropagation(); setDecks(p => p.filter((_, j) => j !== i)); }} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 16, padding: 0, lineHeight: 1, opacity: 0.6 }} title="Delete">×</button>}
                  <div style={{ fontFamily: FONT_TITLE, fontSize: 34, lineHeight: 1.05, color: T.textBright, paddingRight: 18, overflowWrap: "anywhere" }}>{d.name}</div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 11, letterSpacing: 2, color: T.textDim, marginTop: 18, textTransform: "uppercase" }}><span style={{ color: col }}>{d.cards.length}/{DECK_SIZE}</span> cards{d.locked ? " · starter" : ""}</div>
                </div>
              ); })}
            </div></>
          ) : (<>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <button onClick={() => setEditDeck(null)} style={B(T.textDim)}>←</button>
              <input value={decks[editDeck.idx]?.name || ""} readOnly={locked} onChange={e => { const u = [...decks]; u[editDeck.idx] = { ...u[editDeck.idx], name: e.target.value }; setDecks(u); }}
                style={{ ...INP, fontFamily: FONT_UI, fontSize: 13, flex: 1, fontWeight: 700 }} />
              <span style={{ fontSize: 11, color: T.textDim, fontWeight: 700, whiteSpace: "nowrap" }}>{decks[editDeck.idx]?.cards.length}/{DECK_SIZE}</span>
              {locked && <button onClick={() => { const d = decks[editDeck.idx]; setDecks(p => [...p, { name: `${d.name} copy`, cards: [...d.cards], color: pickAccent(p) }]); setEditDeck({ idx: decks.length }); }} style={B(T.silverBright)}>Copy to edit</button>}
              <div style={{ display: "flex", gap: 3 }}>
                {["type", "rarity", "aura"].map(mode => (
                  <button key={mode} onClick={() => setDeckSortMode(mode)} style={{ padding: "4px 10px", border: `1px solid ${deckSortMode === mode ? T.silverBright : T.panelBorder}`, background: deckSortMode === mode ? T.silver + "20" : T.panel, borderRadius: 3, cursor: "pointer", color: deckSortMode === mode ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>{mode}</button>
                ))}
              </div>
            </div>
            {(() => {
              const aura = c => (c.soul || 0) + (c.mind || 0) + (c.will || 0);
              const auraOrder = c => {
                if (c.type !== "being") return 3;
                const a = aura(c); return a === 0 ? 0 : a < 0 ? 1 : 2;
              };
              const sortCards = (cardsArray) => {
                const tOrder = { being: 1, bless: 2, curse: 3, equip: 4, field: 5 };
                return [...cardsArray].sort((a, b) => {
                  if (deckSortMode === "aura") {
                    if (auraOrder(a) !== auraOrder(b)) return auraOrder(a) - auraOrder(b);
                    if (a.type !== "being" && b.type !== "being" && tOrder[a.type] !== tOrder[b.type]) return (tOrder[a.type] || 99) - (tOrder[b.type] || 99);
                    return Math.abs(aura(a)) - Math.abs(aura(b));
                  }
                  if (deckSortMode === "rarity" && a.rarity !== b.rarity) return RO.indexOf(b.rarity) - RO.indexOf(a.rarity);
                  if (tOrder[a.type] !== tOrder[b.type]) return (tOrder[a.type] || 99) - (tOrder[b.type] || 99);
                  const pA = cPwr(a), pB = cPwr(b);
                  if (pA !== pB) return pB - pA;
                  return a.id.localeCompare(b.id);
                });
              };
              const ownedCards = sortCards(ownedCardPool);
              const deckCards = sortCards((decks[editDeck.idx]?.cards || []).map(id => cardMap.get(id)).filter(Boolean));
              return (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, alignItems: "start" }}>
                  {/* COLLECTION panel */}
                  <div style={{ background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, padding: 8 }}>
                    <div style={{ ...LBL, marginBottom: 4, fontSize: 9 }}>COLLECTION <span style={{ color: T.textDim, fontWeight: 400 }}>{locked ? "— starter deck: copy it to make changes" : "— click to add"}</span></div>
                    <div style={{ marginBottom: 6 }}>{renderStatFilter(deckStatF, setDeckStatF)}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {ownedCards.filter(c => STAT_DEFS.every(s => deckStatF[s.key] === null || (c[s.key] || 0) === deckStatF[s.key])).map((card, idx) => {
                        const inDk = decks[editDeck.idx]?.cards.filter(id => id === card.id).length || 0;
                        const avail = owned(card.id) - inDk;
                        const isSpell = card.type === "bless" || card.type === "curse";
                        const deckSpellPwr = (decks[editDeck.idx]?.cards || []).reduce((sum, id) => { const c = cardMap.get(id); return (c?.type === "bless" || c?.type === "curse") ? sum + cPwr(c) : sum; }, 0);
                        const budgetExceeded = isSpell && deckSpellPwr + cPwr(card) > spellBudget;
                        return (<div key={`${card.id}_${idx}`} style={{ position: "relative" }}>
                          <Card card={card} sz={62} dim={avail <= 0 || budgetExceeded} onClick={() => {
                            if (locked || avail <= 0 || budgetExceeded) return; const dk = decks[editDeck.idx];
                            if (dk.cards.length >= DECK_SIZE || inDk >= MAX_COPIES) return;
                            const u = [...decks]; u[editDeck.idx] = { ...dk, cards: [...dk.cards, card.id] }; setDecks(u);
                          }} />
                          <div style={{
                            position: "absolute", top: 1, right: 1, minWidth: 13, height: 13, background: avail > 0 ? T.silverBright : T.danger, borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#000", fontWeight: 800
                          }}>{avail}</div>
                        </div>);
                      })}
                    </div>
                  </div>
                  {/* DECK panel */}
                  <div style={{ background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, padding: 8, position: "sticky", top: 6, alignSelf: "start", maxHeight: "calc(100vh - 60px)", overflowY: "auto" }}>
                    {(() => { const sp = (decks[editDeck.idx]?.cards || []).reduce((s, id) => { const c = cardMap.get(id); return (c?.type === "bless" || c?.type === "curse") ? s + cPwr(c) : s; }, 0); return (
                    <div style={{ ...LBL, marginBottom: 6, fontSize: 9 }}>DECK <span style={{ color: T.textDim, fontWeight: 400 }}>{deckCards.length}/{DECK_SIZE}{locked ? "" : " — click to remove"}</span><span style={{ color: sp >= spellBudget ? T.danger : T.textDim, fontWeight: 400, marginLeft: 6 }}>✦ {sp}/{spellBudget}</span></div>
                    ); })()}
                    {deckCards.length === 0
                      ? <div style={{ fontSize: 9, color: T.textDim, padding: "12px 0", textAlign: "center" }}>Add cards from your collection</div>
                      : <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {deckCards.map((card, i) => (
                          <Card key={`${card.id}_${i}`} card={card} sz={62} onClick={() => {
                            if (locked) return;
                            const u = [...decks]; const cards = [...u[editDeck.idx].cards];
                            const origIdx = cards.indexOf(card.id);
                            if (origIdx !== -1) cards.splice(origIdx, 1);
                            u[editDeck.idx] = { ...u[editDeck.idx], cards }; setDecks(u);
                          }} />
                        ))}
                      </div>
                    }
                  </div>
                </div>
              );
            })()}</>)}
        </div>
  );
}
