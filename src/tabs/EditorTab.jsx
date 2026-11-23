import { useState, useEffect, useMemo } from "react";
import {
  FONT_UI, THEME as T, TYPE_COLORS as TC, RARITY_COLORS as RC, RARITY_ORDER as RO,
  STAT_DEFS, STAT_MIN, STAT_MAX, B, LBL, INP,
} from "../theme.js";
import { cPwr } from "../gameUtils.js";
import { renderStatFilter, Card, VirtualCardGrid } from "../components.jsx";

export default function EditorTab({
  visible, cardPool, setCardPool, cardSetMap, sets, setSets, allImages,
  forgeImgSize, setForgeImgSize, owned, togSet, updateCard, uploadFile, refreshImages,
}) {
  const [editCard, setEditCard] = useState(null);
  const [showArtPanel, setShowArtPanel] = useState(false);
  const [pickedImg, setPickedImg] = useState(null); // Art Bank image waiting for a card: the next card clicked gets it
  const [edF, setEdF] = useState({ set: "all", type: "all", rarity: "all", art: "all", sort: "id", soul: null, mind: null, will: null }); // editor filters
  const [eCardSz, setECardSz] = useState(140); // editor card size

  useEffect(() => { if (visible && showArtPanel) refreshImages(); }, [visible, showArtPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const editorFiltered = useMemo(() => {
    const sortFns = {
      id: (a, b) => a.id.localeCompare(b.id),
      name: (a, b) => (a.name || "").localeCompare(b.name || ""),
      type: (a, b) => { const o = ["being","bless","curse","equip","field"]; return (o.indexOf(a.type) - o.indexOf(b.type)) || a.type.localeCompare(b.type); },
      rarity: (a, b) => RO.indexOf(a.rarity) - RO.indexOf(b.rarity),
      power: (a, b) => cPwr(b) - cPwr(a),
      noart: (a, b) => (a.image ? 1 : 0) - (b.image ? 1 : 0),
    };
    return cardPool
      .filter(c => edF.set === "all" || cardSetMap.get(c.id) === edF.set)
      .filter(c => edF.type === "all" || c.type === edF.type)
      .filter(c => edF.rarity === "all" || c.rarity === edF.rarity)
      .filter(c => edF.art === "all" || (edF.art === "noart" ? !c.image : !!c.image))
      .filter(c => STAT_DEFS.every(s => edF[s.key] === null || (c[s.key] || 0) === edF[s.key]))
      .sort(sortFns[edF.sort] || sortFns.id);
  }, [cardPool, cardSetMap, edF]);
  const filtered = editorFiltered;

  return (
            <div style={{ display: visible ? undefined : "none" }}>
              {/* Filter bar */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>EDITOR</h2>
                <span style={{ fontSize: 8, color: T.textDim }}>({filtered.length}/{cardPool.length})</span>
                <div style={{ marginLeft: "auto" }} />
                {/* Set filter */}
                <select value={edF.set} onChange={e => setEdF(p => ({ ...p, set: e.target.value }))}
                  style={{ ...INP, width: "auto", fontSize: 9, padding: "2px 6px", fontFamily: FONT_UI }}>
                  <option value="all">All Sets</option>
                  {sets.map(s => <option key={s.id} value={s.name}>{s.name} ({s.cardIds.length})</option>)}
                </select>
                {/* Type filter */}
                <div style={{ display: "flex", gap: 1 }}>
                  {["all", "being", "bless", "curse", "equip", "field"].map(t => (
                    <button key={t} onClick={() => setEdF(p => ({ ...p, type: t }))} style={{
                      padding: "1px 5px", border: `1px solid ${edF.type === t ? (TC[t] || T.silver) : T.panelBorder}`,
                      background: edF.type === t ? (TC[t] || T.silver) + "10" : "transparent", borderRadius: 2,
                      color: edF.type === t ? (TC[t] || T.silver) : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, textTransform: "uppercase", fontWeight: 800,
                    }}>{t === "all" ? "All" : t.slice(0, 3)}</button>))}
                </div>
                {/* Rarity filter */}
                <div style={{ display: "flex", gap: 1 }}>
                  <button onClick={() => setEdF(p => ({ ...p, rarity: "all" }))} style={{
                    padding: "1px 4px", border: `1px solid ${edF.rarity === "all" ? T.silver : T.panelBorder}`,
                    background: edF.rarity === "all" ? T.silver + "10" : "transparent", borderRadius: 2,
                    color: edF.rarity === "all" ? T.silver : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700,
                  }}>★</button>
                  {RO.map(r => (
                    <button key={r} onClick={() => setEdF(p => ({ ...p, rarity: r }))} style={{
                      padding: "1px 4px", border: `1px solid ${edF.rarity === r ? RC[r] : T.panelBorder}`,
                      background: edF.rarity === r ? RC[r] + "10" : "transparent", borderRadius: 2,
                      color: edF.rarity === r ? RC[r] : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 700,
                    }}>{r[0].toUpperCase()}</button>))}
                </div>
                {/* Art filter */}
                <button onClick={() => setEdF(p => ({ ...p, art: p.art === "noart" ? "all" : "noart" }))} style={{
                  padding: "1px 6px", border: `1px solid ${edF.art === "noart" ? T.curse : T.panelBorder}`,
                  background: edF.art === "noart" ? T.curse + "15" : "transparent", borderRadius: 2,
                  color: edF.art === "noart" ? T.curse : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 800,
                }}>No Art</button>
                <button onClick={() => setEdF(p => ({ ...p, art: p.art === "art" ? "all" : "art" }))} style={{
                  padding: "1px 6px", border: `1px solid ${edF.art === "art" ? T.bless : T.panelBorder}`,
                  background: edF.art === "art" ? T.bless + "15" : "transparent", borderRadius: 2,
                  color: edF.art === "art" ? T.bless : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 800,
                }}>Art</button>
                <button onClick={() => { setShowArtPanel(p => !p); if (!showArtPanel) refreshImages(); }} style={{
                  padding: "1px 6px", border: `1px solid ${showArtPanel ? T.silverBright : T.panelBorder}`,
                  background: showArtPanel ? T.silver + "12" : "transparent", borderRadius: 2,
                  color: showArtPanel ? T.silverBright : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 6, fontWeight: 800,
                }}>Art Bank</button>
                {/* Sort */}
                <select value={edF.sort} onChange={e => setEdF(p => ({ ...p, sort: e.target.value }))}
                  style={{ ...INP, width: "auto", fontSize: 9, padding: "2px 6px", fontFamily: FONT_UI }}>
                  <option value="id">Sort: ID</option>
                  <option value="name">Sort: Name</option>
                  <option value="type">Sort: Type</option>
                  <option value="rarity">Sort: Rarity</option>
                  <option value="power">Sort: Power</option>
                  <option value="noart">Sort: No Art First</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `1fr${editCard ? " 300px" : ""} auto`, gap: 8 }}>
                {/* Card grid — drag images onto cards to assign art */}
                <div onDragOver={e => e.preventDefault()}>
                  {!filtered.length && <div style={{ fontSize: 10, color: T.textDim, padding: 12 }}>No cards match filters.</div>}
                  <VirtualCardGrid cards={filtered} cardWidth={eCardSz} rowHeight={eCardSz - 4 + (eCardSz < 64 ? 8 : eCardSz < 104 ? 10 : eCardSz < 154 ? 14 : 18) + 8} gap={8} containerStyle={{ maxHeight: showArtPanel ? "calc(55vh - 60px)" : "calc(100vh - 110px)", padding: 2 }} renderCard={card => (
                    <div key={card.id} style={{ position: "relative" }}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px solid ${T.silverBright}`; }}
                      onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
                      onDrop={e => {
                        e.preventDefault(); e.currentTarget.style.outline = "none";
                        const imgPath = e.dataTransfer.getData("text/image-path");
                        if (imgPath) { updateCard(card.id, { image: imgPath }); return; }
                        const files = e.dataTransfer.files;
                        if (files.length && files[0].type.startsWith("image/")) {
                          uploadFile(files[0]).then(path => { if (path) updateCard(card.id, { image: path }); });
                        }
                      }}>
                      <Card card={card} sz={eCardSz - 4} sel={editCard?.id === card.id} onClick={() => {
                        if (pickedImg && showArtPanel) { updateCard(card.id, { image: pickedImg }); setPickedImg(null); }
                        else setEditCard(card);
                      }} />
                      {!card.image && <div style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: "50%", background: T.curse }} />}
                    </div>)} />
                </div>

                {/* Card detail panel */}
                {editCard && (() => {
                  const c = cardPool.find(x => x.id === editCard.id) || editCard;
                  const upd = (field, val) => { updateCard(c.id, { [field]: val }); setEditCard(prev => ({ ...prev, [field]: val })); };
                  const handleEdImg = async (e) => {
                    const f = e.target.files[0]; if (!f) return;
                    const path = await uploadFile(f);
                    if (path) upd("image", path);
                  };
                  return (
                    <div style={{ padding: 10, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, position: "sticky", top: 6, alignSelf: "start", maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px solid ${T.silverBright}`; }}
                          onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
                          onDrop={e => {
                            e.preventDefault(); e.currentTarget.style.outline = "none";
                            const imgPath = e.dataTransfer.getData("text/image-path");
                            if (imgPath) { upd("image", imgPath); return; }
                            const files = e.dataTransfer.files;
                            if (files.length && files[0].type.startsWith("image/")) { uploadFile(files[0]).then(p => { if (p) upd("image", p); }); }
                          }} style={{ borderRadius: 4 }}>
                          <Card card={c} sz={140} />
                          {!c.image && <div style={{ fontSize: 7, color: T.textDim, textAlign: "center", marginTop: 2 }}>drop image here</div>}
                        </div>
                        <button onClick={() => setEditCard(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 14, alignSelf: "start" }}>✕</button>
                      </div>

                      {/* Image upload */}
                      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                        <label style={{ flex: 1, ...B(c.image ? T.being : T.curse), textAlign: "center", cursor: "pointer", fontSize: 9 }}>
                          {c.image ? "Change Art" : "+ Add Art"}
                          <input type="file" accept="image/*" onChange={handleEdImg} style={{ display: "none" }} />
                        </label>
                        {c.image && <button onClick={() => upd("image", null)} style={{ ...B(T.danger), fontSize: 7, padding: "2px 6px" }}>x</button>}
                      </div>

                      <div style={{ marginBottom: 4 }}><label style={LBL}>NAME</label>
                        <input value={c.name || ""} onChange={e => upd("name", e.target.value)} placeholder="Unnamed..." style={INP} /></div>
                      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                        {["being", "bless", "curse", "field", "equip"].map(t => (
                          <button key={t} onClick={() => upd("type", t)} style={{
                            padding: "2px 6px", border: `1px solid ${c.type === t ? TC[t] : T.panelBorder}`,
                            background: c.type === t ? TC[t] + "15" : T.card, borderRadius: 2, color: c.type === t ? TC[t] : T.textDim,
                            cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, textTransform: "uppercase", fontWeight: 800
                          }}>{t}</button>))}</div>
                      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                        {RO.map(r => (
                          <button key={r} onClick={() => upd("rarity", r)} style={{
                            padding: "2px 6px", border: `1px solid ${c.rarity === r ? RC[r] : T.panelBorder}`,
                            background: c.rarity === r ? RC[r] + "10" : T.card, borderRadius: 2, color: c.rarity === r ? RC[r] : T.textDim,
                            cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, textTransform: "uppercase", fontWeight: 800
                          }}>{r}</button>))}</div>
                      <div style={{ marginBottom: 4 }}>
                        {STAT_DEFS.map(s => (
                          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                            <span style={{ fontSize: 9, color: s.color, fontFamily: FONT_UI, fontWeight: 800, width: 16 }}>{s.label}</span>
                            <input type="range" min={STAT_MIN} max={STAT_MAX} value={c[s.key] || 0}
                              onChange={e => upd(s.key, parseInt(e.target.value))} style={{ flex: 1, accentColor: s.color }} />
                            <span style={{ fontSize: 11, color: s.color, fontFamily: FONT_UI, fontWeight: 900, width: 24, textAlign: "right" }}>
                              {(c[s.key] || 0) > 0 ? "+" : ""}{c[s.key] || 0}</span></div>))}</div>
                      {(c.type === "bless" || c.type === "curse") && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                          <span style={{ fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, width: 30 }}>PWR</span>
                          <input type="range" min="1" max="5" value={c.power || 1} onChange={e => upd("power", parseInt(e.target.value))}
                            style={{ flex: 1, accentColor: c.type === "bless" ? T.bless : T.curse }} />
                          <span style={{ fontSize: 10, color: c.type === "bless" ? T.bless : T.curse, fontFamily: FONT_UI, fontWeight: 900 }}>{c.power || 1}</span>
                        </div>)}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 8, fontFamily: FONT_UI, fontWeight: 800, width: 40 }}>WEIGHT</span>
                        <input type="range" min="1" max="100" value={c.weight || 100} onChange={e => upd("weight", parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: T.silverBright }} />
                        <span style={{ fontSize: 10, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, width: 24, textAlign: "right" }}>{c.weight || 100}</span></div>
                      <div style={{ padding: 4, background: T.bg2, borderRadius: 3, marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <div style={LBL}>IN SETS</div>
                          <button onClick={() => { const n = prompt("New Set Name:"); if (n && !sets.some(s => s.name === n)) setSets(p => [...p, { id: "s_" + Date.now(), name: n, cardIds: [c.id] }]); }}
                            style={{ background: "none", border: "none", color: T.silverBright, cursor: "pointer", fontSize: 8, fontFamily: FONT_UI, fontWeight: 800 }}>+ NEW SET</button>
                        </div>
                        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                          {sets.map((s, i) => {
                            return (<button key={i} onClick={() => togSet(i, c.id)} style={{
                              padding: "2px 5px", border: `1px solid ${s.cardIds.includes(c.id) ? T.silverBright : T.panelBorder}`,
                              background: s.cardIds.includes(c.id) ? T.silverBright + "15" : "transparent", borderRadius: 2,
                              color: s.cardIds.includes(c.id) ? T.silverBright : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, fontWeight: 700,
                              display: "inline-flex", alignItems: "center", gap: 2
                            }}>
                              {s.name}</button>);
                          })}</div></div>
                      <div style={{ fontSize: 8, color: T.textDim, marginBottom: 4 }}>Owned: {owned(c.id)} · Power: {cPwr(c)} · ID: {c.id}</div>
                      {/* Prev/Next nav */}
                      <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                        <button onClick={() => { const idx = filtered.findIndex(x => x.id === c.id); if (idx > 0) setEditCard(filtered[idx - 1]); }}
                          disabled={filtered.findIndex(x => x.id === c.id) <= 0}
                          style={{ ...B(T.textDim, filtered.findIndex(x => x.id === c.id) <= 0), flex: 1, fontSize: 9 }}>← Prev</button>
                        <button onClick={() => { const idx = filtered.findIndex(x => x.id === c.id); if (idx < filtered.length - 1) setEditCard(filtered[idx + 1]); }}
                          disabled={filtered.findIndex(x => x.id === c.id) >= filtered.length - 1}
                          style={{ ...B(T.textDim, filtered.findIndex(x => x.id === c.id) >= filtered.length - 1), flex: 1, fontSize: 9 }}>Next →</button>
                      </div>
                      <button onClick={() => { setCardPool(p => p.filter(x => x.id !== c.id)); setEditCard(null); }}
                        style={{ ...B(T.danger), width: "100%", fontSize: 8 }}>Delete Card</button>
                    </div>);
                })()}
                <div style={{ position: "sticky", top: 6, alignSelf: "start" }}>
                  <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, opacity: 0.5 }}>SIZE</div>
                    <input type="range" className="darkRange" min={40} max={200} step={10} value={eCardSz} onChange={e => setECardSz(+e.target.value)}
                      style={{ width: 90 }} />
                  </div>
                  {renderStatFilter(edF, f => setEdF(p => ({ ...p, ...f(p) })), true)}
                </div>
              </div>
              {/* Art Bank — unassigned images, full width under the card grid */}
              {showArtPanel && (() => {
                const assigned = new Set(cardPool.map(c => c.image).filter(Boolean));
                const free = allImages.filter(p => !assigned.has(p));
                return (
                  <div style={{ marginTop: 8, height: "calc(45vh - 60px)", overflowY: "auto", padding: 6, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                      <span style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, letterSpacing: 1.5 }}>
                        UNASSIGNED
                      </span>
                      <span style={{ fontSize: 8, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900 }}>{free.length}</span>
                      {pickedImg && <span style={{ fontSize: 7, color: T.legendary, fontFamily: FONT_UI, fontWeight: 700, letterSpacing: 1 }}>→ CLICK A CARD</span>}
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}>
                        <input type="range" min="40" max="200" value={forgeImgSize} onChange={e => setForgeImgSize(parseInt(e.target.value))} style={{ width: 90, accentColor: T.silver }} />
                      </div>
                    </div>
                    {!free.length && <div style={{ fontSize: 8, color: T.textDim, padding: 8, textAlign: "center" }}>All images assigned</div>}
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${forgeImgSize}px, 1fr))`, gap: 4, padding: 1 }}>
                      {free.map(img => (
                        <div key={img} draggable
                          onDragStart={e => { e.dataTransfer.setData("text/image-path", img); e.dataTransfer.effectAllowed = "copy"; }}
                          onClick={() => {
                            if (editCard) { updateCard(editCard.id, { image: img }); setEditCard(prev => ({ ...prev, image: img })); }
                            else setPickedImg(p => p === img ? null : img);
                          }}
                          title={img.split("/").pop()}
                          style={{
                            width: "100%", aspectRatio: "1/1", borderRadius: 3, cursor: "pointer",
                            background: `url(${img}) center/cover`,
                            border: `1.5px solid ${pickedImg === img ? T.legendary : T.panelBorder}`,
                            outline: pickedImg === img ? `2px solid ${T.legendary}` : "none",
                            transition: "border-color .15s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = pickedImg === img ? T.legendary : T.silverBright; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = pickedImg === img ? T.legendary : T.panelBorder; }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
  );
}
