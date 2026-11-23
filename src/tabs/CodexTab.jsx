import { useState, useMemo } from "react";
import { FONT_UI, THEME as T, TYPE_COLORS as TC, RARITY_COLORS as RC, STAT_DEFS, LBL, INP } from "../theme.js";
import { aura, orient, oCol } from "../gameUtils.js";
import { renderStatFilter, Card, VirtualCardGrid } from "../components.jsx";

// readOnly (the live build): a plain card browser — no naming, no set filter or set membership, no owned counts
export default function CodexTab({ visible, cardPool, cardSetMap, sets, owned, togSet, updateCard, readOnly }) {
  const [bF, setBF] = useState("all"); const [bSetF, setBSetF] = useState("all"); const [bStatF, setBStatF] = useState({ soul: null, mind: null, will: null });
  const [bDet, setBDet] = useState(null); const [editN, setEditN] = useState(null);
  const [bCardSz, setBCardSz] = useState(140); // codex card size

  const browseFiltered = useMemo(() =>
    cardPool.filter(c =>
      (bF === "all" || c.type === bF) &&
      (bSetF === "all" || cardSetMap.get(c.id) === bSetF) &&
      STAT_DEFS.every(s => bStatF[s.key] === null || (c[s.key] || 0) === bStatF[s.key])
    ), [cardPool, cardSetMap, bF, bSetF, bStatF]);

  return (
        <div style={{ display: visible ? undefined : "none" }}>
          <div style={{ display: "flex", gap: 3, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>CODEX</h2>
            <div style={{ marginLeft: "auto", display: "flex", gap: 1 }}>
              {["all", "being", "bless", "curse", "equip", "field"].map(f => (
                <button key={f} onClick={() => setBF(f)} style={{
                  padding: "1px 5px", border: `1px solid ${bF === f ? (TC[f] || T.silver) : T.panelBorder}`,
                  background: bF === f ? (TC[f] || T.silver) + "10" : "transparent", borderRadius: 2,
                  color: bF === f ? (TC[f] || T.silver) : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, textTransform: "uppercase", fontWeight: 800
                }}>{f}</button>))}</div></div>
          {!readOnly && <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
            <button onClick={() => setBSetF("all")} style={{
              padding: "1px 5px", border: `1px solid ${bSetF === "all" ? T.silver : T.panelBorder}`,
              background: bSetF === "all" ? T.silver + "10" : "transparent", borderRadius: 2, color: bSetF === "all" ? T.silver : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700
            }}>All</button>
            {sets.map(s => (<button key={s.id} onClick={() => setBSetF(s.name)} style={{
              padding: "1px 5px", border: `1px solid ${bSetF === s.name ? T.silver : T.panelBorder}`,
              background: bSetF === s.name ? T.silver + "10" : "transparent", borderRadius: 2, color: bSetF === s.name ? T.silver : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700
            }}>{s.name}</button>))}
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: `1fr${bDet ? " 220px" : ""} auto`, gap: 6, marginTop: 8 }}>
            <VirtualCardGrid cards={browseFiltered} cardWidth={bCardSz} rowHeight={bCardSz - 4 + (bCardSz < 64 ? 8 : bCardSz < 104 ? 10 : bCardSz < 154 ? 14 : 18) + 8} gap={8} containerStyle={{ maxHeight: "calc(100vh - 130px)" }} renderCard={card => {
              const isMasked = !owned(card.id) && card.rarity === "legendary";
              return (
                <div key={card.id} style={{ position: "relative" }}>
                  <Card card={card} sz={bCardSz - 4} onClick={isMasked ? undefined : () => { setBDet(card); setEditN(null); }} sel={bDet?.id === card.id} notOwned={!owned(card.id)} mask={!owned(card.id)} artMask />
                  {!readOnly && owned(card.id) > 0 && <div style={{
                    position: "absolute", top: -2, right: -2, minWidth: 10, height: 10, background: T.silverBright, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, color: "#000", fontWeight: 800
                  }}>{owned(card.id)}</div>}
                </div>);
            }} />
            {bDet && (
              <div style={{ padding: 6, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, position: "sticky", top: 6, alignSelf: "start" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><Card card={bDet} sz={110} />
                  <button onClick={() => setBDet(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 11 }}>✕</button></div>
                {!readOnly && <div style={{ marginTop: 4 }}>
                  {editN === bDet.id ? (<input autoFocus value={bDet.name || ""} onChange={e => { updateCard(bDet.id, { name: e.target.value }); setBDet(p => ({ ...p, name: e.target.value })); }}
                    onBlur={() => setEditN(null)} onKeyDown={e => e.key === "Enter" && setEditN(null)} style={{ ...INP, fontFamily: FONT_UI, fontSize: 11, fontWeight: 800 }} />
                  ) : (<h3 onClick={() => setEditN(bDet.id)} style={{
                    fontFamily: FONT_UI, fontSize: 11, color: bDet.name ? T.textBright : T.textDim,
                    margin: 0, fontWeight: 800, cursor: "pointer", borderBottom: `1px dashed ${T.panelBorder}`
                  }}>{bDet.name || "Click to name..."}</h3>)}</div>}
                <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                  <span style={{ fontSize: 7, color: TC[bDet.type], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800 }}>{bDet.type}</span>
                  <span style={{ fontSize: 7, color: RC[bDet.rarity], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800 }}>{bDet.rarity}</span>
                  {!readOnly && <span style={{ fontSize: 7, color: T.textDim }}>×{owned(bDet.id)}</span>}</div>
                {bDet.type === "being" && (<>
                  <div style={{ marginTop: 3, display: "flex", gap: 6 }}>
                    {STAT_DEFS.map(s => (<div key={s.key} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontFamily: FONT_UI, fontWeight: 900, color: s.color }}>{(bDet[s.key] || 0) > 0 ? "+" : ""}{bDet[s.key] || 0}</div>
                      <div style={{ fontSize: 6, color: T.textDim, fontWeight: 700 }}>{s.label}</div></div>))}</div>
                  <div style={{ fontSize: 7, color: oCol(orient(bDet)), fontFamily: FONT_UI, fontWeight: 700 }}>
                    {orient(bDet) === "balanced" ? "✡ Transcendent" : orient(bDet)} · aura {aura(bDet)}</div></>)}
                {!readOnly && <div style={{ marginTop: 4, padding: 3, background: T.bg2, borderRadius: 2 }}>
                  <div style={{ ...LBL, marginBottom: 2 }}>IN SETS</div>
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {sets.map((s, i) => {
                      return (<button key={i} onClick={() => togSet(i, bDet.id)} style={{
                        padding: "1px 4px",
                        border: `1px solid ${s.cardIds.includes(bDet.id) ? T.silverBright : T.panelBorder}`,
                        background: s.cardIds.includes(bDet.id) ? T.silverBright + "15" : "transparent", borderRadius: 2,
                        color: s.cardIds.includes(bDet.id) ? T.silverBright : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700,
                        display: "inline-flex", alignItems: "center", gap: 2
                      }}>
                        {s.name}</button>);
                    })}</div></div>}
              </div>)}
            <div style={{ position: "sticky", top: 6, alignSelf: "start" }}>
              <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, opacity: 0.5 }}>SIZE</div>
                <input type="range" className="darkRange" min={40} max={200} step={10} value={bCardSz} onChange={e => setBCardSz(+e.target.value)}
                  style={{ width: 90 }} />
              </div>
              {renderStatFilter(bStatF, setBStatF, true)}
            </div>
          </div></div>
  );
}
