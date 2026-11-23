import {
  FONT_UI, THEME as T, TYPE_COLORS as TC, DEFAULT_GRADS as DG, RARITY_COLORS as RC,
  RARITY_ORDER as RO, STAT_DEFS, STAT_MIN, STAT_MAX, B, LBL, INP,
} from "../theme.js";
import { CAMPAIGN_SET_IDS } from "../gameUtils.js";
import { Card } from "../components.jsx";

export default function ForgeTab({
  sets, decks, setDecks, cardPool, allImages, uploadFile, handleImg, createCard,
  forgeMode, setForgeMode, forgeImgSize, setForgeImgSize,
  nc, setNc, gen, setGen, genMode, setGenMode, genSeed, setGenSeed, genImages, setGenImages,
  camGen, setCamGen, camSeed, setCamSeed, autoGenCfg, setAutoGenCfg,
  livePreview, campaignPreview, dragRef,
  generateSet, generateCampaign, generateStructureDecks,
  simulating, setSimulating,
}) {
  return (
          <div style={{ animation: "fadeIn .3s" }}>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
              {[["single", "Card"], ["generate", "Set"], ["campaign", "Campaign"], ["decks", "Decks"]].map(([m, l]) => (
                <button key={m} onClick={() => setForgeMode(m)} style={{
                  padding: "5px 14px", border: `1px solid ${forgeMode === m ? T.silverBright : T.panelBorder}`,
                  background: forgeMode === m ? T.silver + "12" : T.panel, borderRadius: 3, cursor: "pointer",
                  color: forgeMode === m ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 9, fontWeight: 700,
                }}>{l}</button>
              ))}
            </div>

            {forgeMode === "single" ? (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, padding: 12, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 10 }}>
                    {nc.image ? (
                      <div onClick={() => setNc(p => ({ ...p, image: null }))} title="Click to remove image" style={{
                        width: 120, height: 120, borderRadius: 3, cursor: "pointer",
                        background: `url(${nc.image}) center/cover`,
                        border: `1.5px solid ${T.panelBorder}`, flexShrink: 0
                      }} />
                    ) : (
                      <label style={{
                        width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1.5px dashed ${T.panelBorder}`, borderRadius: 3, cursor: "pointer",
                        background: `linear-gradient(145deg,${nc.gradient[0]},${nc.gradient[1]})`,
                        fontSize: 18, color: T.textDim
                      }}>＋<input type="file" accept="image/*" onChange={handleImg} style={{ display: "none" }} /></label>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} placeholder="Name..." style={{ ...INP, fontSize: 14, padding: "6px 10px" }} />
                      <input value={nc.set} onChange={e => setNc(p => ({ ...p, set: e.target.value }))} placeholder="Set..." style={{ ...INP, fontSize: 14, padding: "6px 10px" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                    {["being", "bless", "curse", "field", "equip"].map(t => (
                      <button key={t} onClick={() => setNc(p => ({ ...p, type: t, gradient: DG[t] || DG.being }))} style={{
                        padding: "4px 10px", border: `1px solid ${nc.type === t ? TC[t] : T.panelBorder}`,
                        background: nc.type === t ? TC[t] + "15" : T.card, borderRadius: 2, color: nc.type === t ? TC[t] : T.textDim,
                        cursor: "pointer", fontFamily: FONT_UI, fontSize: 8, textTransform: "uppercase", fontWeight: 800
                      }}>{t}</button>))}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                      {RO.map(r => (<button key={r} onClick={() => setNc(p => ({ ...p, rarity: r }))} style={{
                        padding: "2px 8px", border: `1px solid ${nc.rarity === r ? RC[r] : T.panelBorder}`, background: nc.rarity === r ? RC[r] + "10" : T.card, borderRadius: 2,
                        color: nc.rarity === r ? RC[r] : T.textDim, cursor: "pointer", fontFamily: FONT_UI, fontSize: 7, textTransform: "uppercase", fontWeight: 800
                      }}>{r[0]}</button>))}
                    </div>
                  </div>
                  {["being", "field", "equip"].includes(nc.type) && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                      {STAT_DEFS.map(s => (<div key={s.key} style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: s.color, fontFamily: FONT_UI, fontWeight: 800 }}>{s.label}</span>
                          <span style={{ fontSize: 11, color: s.color, fontFamily: FONT_UI, fontWeight: 900 }}>{nc[s.key] > 0 ? "+" : ""}{nc[s.key]}</span></div>
                        <input type="range" min={STAT_MIN} max={STAT_MAX} value={nc[s.key]} onChange={e => setNc(p => ({ ...p, [s.key]: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: s.color }} />
                      </div>))}
                    </div>)}
                  {(nc.type === "bless" || nc.type === "curse") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input type="range" min="1" max="3" value={nc.power} onChange={e => setNc(p => ({ ...p, power: parseInt(e.target.value) }))} style={{ width: 120, accentColor: nc.type === "bless" ? T.bless : T.curse }} />
                      <span style={{ fontSize: 14, color: nc.type === "bless" ? T.bless : T.curse, fontFamily: FONT_UI, fontWeight: 900 }}>{nc.type === "bless" ? "+" : "−"}{nc.power}C</span>
                    </div>)}
                  <button onClick={createCard} style={{ ...B(T.silverBright), letterSpacing: 3, fontSize: 11, width: "100%", padding: "6px 10px" }}>FORGE CARD</button>
                  {/* Unassigned images grid */}
                  {(() => {
                    const assigned = new Set(cardPool.map(c => c.image).filter(Boolean));
                    const free = allImages.filter(p => !assigned.has(p));
                    if (!free.length) return null;
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 8, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, letterSpacing: 2 }}>
                            UNASSIGNED — {free.length}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                            <span style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, fontWeight: 700, letterSpacing: 1 }}>SIZE</span>
                            <input type="range" min="60" max="300" value={forgeImgSize} onChange={e => setForgeImgSize(parseInt(e.target.value))} style={{ width: 80, accentColor: T.silver }} />
                            <span style={{ fontSize: 8, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, minWidth: 26 }}>{forgeImgSize}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 480, overflowY: "auto", padding: 2 }}>
                          {free.map(img => (
                            <div key={img} onClick={() => setNc(p => ({ ...p, image: img }))}
                              title={img.split("/").pop()}
                              style={{
                                width: forgeImgSize, height: forgeImgSize, borderRadius: 3, cursor: "pointer", flexShrink: 0,
                                background: `url(${img}) center/cover`,
                                border: `1.5px solid ${nc.image === img ? T.silverBright : T.panelBorder}`,
                                outline: nc.image === img ? `1px solid ${T.silverBright}` : "none",
                              }} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 200 }}>
                  <Card card={{ ...nc, id: "preview" }} sz={180} />
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: FONT_UI }}>{cardPool.length} cards</div>
                </div>
              </div>
            ) : forgeMode === "generate" ? (
              /* SET GENERATOR */
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", height: "calc(100vh - 120px)" }}>
                <div style={{ width: 360, flexShrink: 0, padding: 12, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, overflowY: "auto", maxHeight: "100%" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, marginBottom: 12 }}>
                    <div><label style={LBL}>SET NAME</label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={gen.name} onChange={e => setGen(p => ({ ...p, name: e.target.value }))} style={{ ...INP, fontSize: 14, padding: "6px 10px", flex: 1 }} />
                        <input type="color" value={gen.color} onChange={e => setGen(p => ({ ...p, color: e.target.value }))} title="Set color" style={{ width: 34, height: 34, border: `1px solid ${T.panelBorder}`, borderRadius: 3, cursor: "pointer", padding: 2, background: T.bg2, flexShrink: 0 }} />
                      </div></div>
                    <div><label style={LBL}>TOTAL CARDS</label>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginTop: 4 }}>
                        <input type="range" min="10" max="2000" value={gen.total} onChange={e => setGen(p => ({ ...p, total: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: T.silver }} />
                        <span style={{ fontFamily: FONT_UI, fontSize: 13, color: T.silverBright, fontWeight: 900, marginTop: 2 }}>{gen.total}</span>
                      </div></div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={LBL}>TYPE DISTRIBUTION</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 4 }}>
                      {[["Being", "pctEntity", TC.being], ["Bless", "pctBless", TC.bless], ["Curse", "pctCurse", TC.curse], ["Equip", "pctItem", TC.item], ["Field", "pctTerrain", TC.field]].map(([label, key, color]) => (
                        <div key={key} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 8, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                          <input type="range" min="0" max="100" value={gen[key]} onChange={e => setGen(p => ({ ...p, [key]: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: color }} />
                          <div style={{ fontSize: 11, color, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[key]}%</div>
                          <div style={{ fontSize: 8, color: T.textDim }}>≈{Math.round(gen.total * gen[key] / 100)}</div>
                        </div>))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={LBL}>ENTITY POWER BUDGET (|S|+|M|+|W|)</label>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      {[["Min", "powerMin"], ["Max", "powerMax"]].map(([label, key]) => (
                        <div key={key} style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 8, color: T.textDim, fontFamily: FONT_UI }}>{label}</span>
                            <span style={{ fontSize: 11, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[key]}</span></div>
                          <input type="range" min="0" max="9" value={gen[key]} onChange={e => setGen(p => {
                            const v = parseInt(e.target.value);
                            return key === "powerMin" ? { ...p, powerMin: Math.min(v, p.powerMax) } : { ...p, powerMax: Math.max(v, p.powerMin) };
                          })} style={{ width: "100%", accentColor: T.silver }} />
                        </div>))}
                    </div>
                    <div style={{ fontSize: 8, color: T.textDim, marginTop: 2 }}>3–4 = commons. 5–6 = mid-range. 7–9 = powerhouse.</div>
                  </div>
                  {/* Blessing / Curse power ranges */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    {[["Blessing Pwr", "blessPwrMin", "blessPwrMax", TC.bless], ["Curse Pwr", "cursePwrMin", "cursePwrMax", TC.curse]].map(([label, minK, maxK, color]) => (
                      <div key={label}>
                        <label style={{ ...LBL, color }}>{label}</label>
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          {[[minK, "Min"], [maxK, "Max"]].map(([k, lb]) => (
                            <div key={k} style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 7, color: T.textDim }}>{lb}</span>
                                <span style={{ fontSize: 10, color, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[k]}</span></div>
                              <input type="range" min="1" max="5" value={gen[k]} onChange={e => {
                                const v = parseInt(e.target.value);
                                setGen(p => k.includes("Min") ? { ...p, [k]: Math.min(v, p[maxK]) } : { ...p, [k]: Math.max(v, p[minK]) });
                              }} style={{ width: "100%", accentColor: color }} />
                            </div>))}
                        </div>
                      </div>))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={LBL}>RARITY DISTRIBUTION</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 4 }}>
                      {[["Common", "rarCommon", RC.common], ["Uncommon", "rarUncommon", RC.uncommon], ["Rare", "rarRare", RC.rare], ["Legend", "rarLegendary", RC.legendary]].map(([label, key, color]) => (
                        <div key={key} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                          <input type="range" min="0" max="100" value={gen[key]} onChange={e => setGen(p => ({ ...p, [key]: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: color }} />
                          <div style={{ fontSize: 10, color, fontFamily: FONT_UI, fontWeight: 900 }}>{gen[key]}%</div>
                        </div>))}
                    </div>
                  </div>
                  {/* Generation mode */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={LBL}>GENERATION MODE</label>
                    <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                      {[["permute", "All Permutations"], ["random", "Random (rarity >> power)"]].map(([m, l]) => (
                        <button key={m} onClick={() => setGenMode(m)} style={{
                          flex: 1, padding: "5px 8px", border: `1px solid ${genMode === m ? T.silverBright : T.panelBorder}`,
                          background: genMode === m ? T.silver + "12" : T.bg2, borderRadius: 3, cursor: "pointer",
                          color: genMode === m ? T.silverBright : T.textDim, fontFamily: FONT_UI, fontSize: 8, fontWeight: 700,
                        }}>{l}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 8, color: T.textDim, marginTop: 3 }}>
                      {genMode === "random"
                        ? "Common = low power, Legendary = high power. Random stats within budget."
                        : `Cycles through all S/M/W combos where |S|+|M|+|W| is ${gen.powerMin}–${gen.powerMax}. Specific distributions depending on types.`}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 8, fontSize: 9, color: T.textBright, fontFamily: FONT_UI }}>
                      <input type="checkbox" checked={gen.ensureTypes || false} onChange={e => setGen(p => ({ ...p, ensureTypes: e.target.checked }))} style={{ accentColor: T.silverBright }} />
                      GUARANTEE AT LEAST 1 OF EACH TYPE PER RARITY
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                    <button onClick={() => { generateSet(); setGen(p => ({ ...p, name: "New Set " + (sets.length + 1) })); }}
                      style={{ ...B(T.silverBright), letterSpacing: 4, fontSize: 13, flex: 1, padding: "8px 16px" }}>
                      GENERATE {gen.total} → "{gen.name}"
                    </button>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{ fontSize: 6, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 1 }}>SEED</span>
                      <input type="number" value={genSeed} onChange={e => setGenSeed(parseInt(e.target.value) || 1)}
                        style={{ width: 52, background: "transparent", color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${T.panelBorder}`, borderRadius: 2, padding: "4px 5px", outline: "none", textAlign: "center" }} />
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, height: "100%" }}>
                  {/* Live preview table — updates as you drag sliders */}
                  <div style={{ padding: 8, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, flex: 1, overflowY: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <label style={LBL}>PREVIEW ({livePreview.length} cards)</label>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <label style={{ ...B(T.silverDim), fontSize: 7, padding: "3px 8px", cursor: "pointer" }}>
                          Random Assign Images<input type="file" accept="image/*" multiple onChange={async (e) => {
                            const files = Array.from(e.target.files);
                            if (!files.length) return;
                            for (let fi = 0; fi < files.length; fi++) {
                              const path = await uploadFile(files[fi]);
                              if (path) {
                                setGenImages(prev => {
                                  const n = { ...prev };
                                  for (let ri = fi; ri < livePreview.length; ri += files.length) {
                                    n[ri] = path;
                                  }
                                  return n;
                                });
                              }
                            }
                            e.target.value = "";
                          }} style={{ display: "none" }} />
                        </label>
                        {Object.keys(genImages).length > 0 && <button onClick={() => setGenImages({})} style={{ ...B(T.textDim), fontSize: 7, padding: "3px 8px" }}>Clear Art</button>}
                        <div style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI }}>
                          {["being", "bless", "curse", "field", "equip"].map(t => {
                            const n = livePreview.filter(c => c.type === t).length;
                            return n ? <span key={t} style={{ color: TC[t] || T.text, marginLeft: 6 }}>{n} {t.slice(0, 3)}</span> : null;
                          })}
                        </div>
                      </div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, fontFamily: FONT_UI }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${T.panelBorder}`, position: "sticky", top: 0, background: T.panel }}>
                          {["#", "Art", "Type", "Uniq", "S", "M", "W", "|Pwr|", "Aura", "Rar", "C Pwr"].map(h => (
                            <th key={h} style={{ textAlign: "left", padding: "2px 4px", color: T.textDim, fontWeight: 700, fontSize: 7, letterSpacing: 1 }}>{h}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {livePreview.map((c, i) => {
                          const pwr = Math.abs(c.soul) + Math.abs(c.mind) + Math.abs(c.will);
                          const au = c.soul + c.mind + c.will;
                          const ori = au > 0 ? "△" : au < 0 ? "▽" : pwr > 0 ? "✡" : "";
                          const img = genImages[i];
                          return (
                            <tr key={i} style={{ borderBottom: `1px solid ${T.panelBorder}15` }}>
                              <td style={{ padding: "1px 4px", color: T.textDim }}>{i + 1}</td>
                              <td style={{ padding: "1px 2px" }}>
                                <label
                                  draggable={!!img}
                                  onDragStart={() => { dragRef.current = i; }}
                                  onDragOver={e => e.preventDefault()}
                                  onDrop={e => { e.preventDefault(); const from = dragRef.current; if (from !== null && from !== i) { setGenImages(prev => { const n = { ...prev }; const tmp = n[from]; n[from] = n[i]; n[i] = tmp; return n; }); } dragRef.current = null; }}
                                  style={{
                                    width: 20, height: 20, display: "block", borderRadius: 2, cursor: img ? "grab" : "pointer",
                                    background: img ? `url(${img}) center/cover` : T.bg2,
                                    border: `1px solid ${img ? T.silverDim : T.panelBorder}`
                                  }}
                                >
                                  {!img && <span style={{ fontSize: 8, color: T.textDim, lineHeight: "20px", textAlign: "center", display: "block" }}>+</span>}
                                  <input type="file" accept="image/*" onChange={async (e) => {
                                    const f = e.target.files[0]; if (!f) return;
                                    const path = await uploadFile(f);
                                    if (path) setGenImages(prev => ({ ...prev, [i]: path }));
                                    e.target.value = "";
                                  }} style={{ display: "none" }} />
                                </label>
                              </td>
                              <td style={{ padding: "1px 4px", color: TC[c.type] || T.text }}>{c.type.slice(0, 3)}</td>
                              <td style={{ padding: "1px 4px", color: T.textBright }}>{c.isUnique ? "✧" : "·"}</td>
                              <td style={{ padding: "1px 4px", color: c.soul > 0 ? STAT_DEFS[0].color : c.soul < 0 ? T.curse : T.textDim }}>{c.soul || "·"}</td>
                              <td style={{ padding: "1px 4px", color: c.mind > 0 ? STAT_DEFS[1].color : c.mind < 0 ? T.curse : T.textDim }}>{c.mind || "·"}</td>
                              <td style={{ padding: "1px 4px", color: c.will > 0 ? STAT_DEFS[2].color : c.will < 0 ? T.curse : T.textDim }}>{c.will || "·"}</td>
                              <td style={{ padding: "1px 4px", color: T.silverBright, fontWeight: 800 }}>{pwr || "·"}</td>
                              <td style={{ padding: "1px 4px", color: au > 0 ? T.light : au < 0 ? T.dark : T.balanced }}>{ori === "✡" ? <span style={{ fontSize: "1.3em", lineHeight: 1 }}>✡</span> : ori}{au || ""}</td>
                              <td style={{ padding: "1px 4px", color: RC[c.rarity] }}>{c.rarity?.[0]?.toUpperCase()}</td>
                              <td style={{ padding: "1px 4px", color: c.power ? (c.type === "bless" ? TC.bless : TC.curse) : T.textDim }}>{c.power || "·"}</td>
                            </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Existing sets */}
                  <div style={{ padding: 8, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: T.textBright, fontFamily: FONT_UI, fontWeight: 800, letterSpacing: 1, alignSelf: "center", marginRight: 4 }}>EXISTING SETS</div>
                    {sets.map(s => (
                      <div key={s.id} style={{ padding: "3px 8px", background: T.bg1, border: `1px solid ${T.panelBorder}`, borderRadius: 3, fontSize: 8, color: T.textDim, fontFamily: FONT_UI }}>
                        <span style={{ color: T.textBright, fontWeight: 700 }}>{s.name}</span> · {s.cardIds.length}
                      </div>))}
                  </div>
                </div>
              </div>
            ) : forgeMode === "campaign" ? (
              /* CAMPAIGN GENERATOR */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* ── Controls strip (fixed-width columns, h-scroll if needed) ── */}
                <div style={{ overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: 0, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4, alignItems: "stretch", minWidth: "max-content" }}>

                    {/* Col 1: Cards/set + dist mode + generate — 175px */}
                    <div style={{ width: 175, flexShrink: 0, padding: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                      <label style={LBL}>AVG CARDS / SET</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="number" min="10" max="2000" value={camGen.cardsPerSet} onChange={e => setCamGen(p => ({ ...p, cardsPerSet: Math.max(10, Math.min(2000, parseInt(e.target.value) || 10)) }))} style={{ width: 80, background: T.bg3 || T.bg2, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 13, border: `1px solid ${T.silver}55`, borderRadius: 2, padding: "2px 6px" }} />
                      </div>
                      <div style={{ fontSize: 7, color: T.textDim }}>{camGen.cardsPerSet * CAMPAIGN_SET_IDS.length} total</div>
                      <label style={LBL}>DISTRIBUTION</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {[["uniform", "Uniform"], ["bell", "Bell (mid heavy)"], ["ramp", "Ramp (A→Z grows)"], ["ramp_inv", "Ramp (A→Z shrinks)"]].map(([m, l]) => (
                          <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 7, color: camGen.distMode === m ? T.silverBright : T.textDim, fontFamily: FONT_UI }}>
                            <input type="radio" name="distMode" checked={camGen.distMode === m} onChange={() => setCamGen(p => ({ ...p, distMode: m }))} style={{ accentColor: T.silverBright }} />
                            {l}
                          </label>
                        ))}
                      </div>
                      {camGen.distMode === "bell" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 7, color: T.textDim, fontFamily: FONT_UI, flexShrink: 0 }}>Spread</span>
                          <input type="range" min="10" max="100" value={camGen.bellSpread} onChange={e => setCamGen(p => ({ ...p, bellSpread: parseInt(e.target.value) }))} style={{ width: 70, accentColor: T.silver }} />
                          <span style={{ fontSize: 9, color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, minWidth: 20 }}>{camGen.bellSpread}</span>
                        </div>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 7, color: T.textBright, fontFamily: FONT_UI, marginTop: 2 }}>
                        <input type="checkbox" checked={camGen.ensureTypes} onChange={e => setCamGen(p => ({ ...p, ensureTypes: e.target.checked }))} style={{ accentColor: T.silverBright }} />
                        ENSURE TYPES
                      </label>
                      <button onClick={generateCampaign} style={{ ...B(T.legendary), letterSpacing: 2, fontSize: 10, padding: "7px 8px", marginTop: 4 }}>
                        ✦ GENERATE
                      </button>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 6, color: T.textDim, fontFamily: FONT_UI, letterSpacing: 1 }}>SEED</span>
                        <input type="number" value={camSeed} onChange={e => setCamSeed(parseInt(e.target.value) || 1)}
                          style={{ width: 52, background: "transparent", color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${T.panelBorder}`, borderRadius: 2, padding: "3px 5px", outline: "none", textAlign: "center" }} />
                      </div>
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 2: Entity power ramp — 205px */}
                    <div style={{ width: 205, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>ENTITY POWER (|S|+|M|+|W|)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        {[["A", "startPowerMin", "startPowerMax", T.silverDim], ["Z", "endPowerMin", "endPowerMax", T.silverBright]].map(([label, minK, maxK, color]) => (
                          <div key={label} style={{ padding: "4px 6px", background: T.bg2, borderRadius: 3, border: `1px solid ${color}28` }}>
                            <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                            {[[minK, "↓"], [maxK, "↑"]].map(([k, lb]) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: 7, color: T.textDim, width: 8, flexShrink: 0 }}>{lb}</span>
                                <input type="number" min="0" max="9" value={camGen[k]} onChange={e => { const v = Math.max(0, Math.min(9, parseInt(e.target.value) || 0)); setCamGen(p => k.endsWith("Min") ? { ...p, [k]: Math.min(v, p[maxK]) } : { ...p, [k]: Math.max(v, p[minK]) }); }} style={{ width: 50, background: T.bg3 || T.bg2, color, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${color}55`, borderRadius: 2, padding: "1px 4px" }} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div style={{ height: 2, borderRadius: 1, marginTop: 4, background: `linear-gradient(to right, ${T.silverDim}, ${T.silverBright})` }} />
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 3: Bless/Curse/Equip/Terr power — 220px */}
                    <div style={{ width: 220, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>BLESS / CURSE / EQUIP / TERR PWR</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                        {[
                          ["Bless A", "startBlessPwrMin", "startBlessPwrMax", TC.bless], ["Bless Z", "endBlessPwrMin", "endBlessPwrMax", TC.bless],
                          ["Curse A", "startCursePwrMin", "startCursePwrMax", TC.curse], ["Curse Z", "endCursePwrMin", "endCursePwrMax", TC.curse],
                          ["Equip A", "startEquipPwrMin", "startEquipPwrMax", TC.equip], ["Equip Z", "endEquipPwrMin", "endEquipPwrMax", TC.equip],
                          ["Terr A", "startTerrPwrMin", "startTerrPwrMax", TC.field], ["Terr Z", "endTerrPwrMin", "endTerrPwrMax", TC.field],
                        ].map(([label, minK, maxK, color]) => (
                          <div key={label} style={{ padding: "4px 6px", background: T.bg2, borderRadius: 3, border: `1px solid ${color}22` }}>
                            <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 2 }}>{label}</div>
                            {[[minK, "↓"], [maxK, "↑"]].map(([k, lb]) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: 7, color: T.textDim, width: 8, flexShrink: 0 }}>{lb}</span>
                                <input type="number" min="1" max="9" value={camGen[k]} onChange={e => { const v = Math.max(1, Math.min(9, parseInt(e.target.value) || 1)); setCamGen(p => k.endsWith("Min") ? { ...p, [k]: Math.min(v, p[maxK]) } : { ...p, [k]: Math.max(v, p[minK]) }); }} style={{ width: 50, background: T.bg3 || T.bg2, color, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${color}55`, borderRadius: 2, padding: "1px 4px" }} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 4: Type distribution — 160px */}
                    <div style={{ width: 160, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>TYPE DISTRIBUTION</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                        {[["Ent", "pctEntity", TC.being], ["Bless", "pctBless", TC.bless], ["Curse", "pctCurse", TC.curse], ["Equip", "pctItem", TC.equip], ["Terr", "pctTerrain", TC.field]].map(([label, key, color]) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, width: 30, flexShrink: 0 }}>{label}</span>
                            <input type="number" min="0" max="100" value={camGen[key]} onChange={e => setCamGen(p => ({ ...p, [key]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))} style={{ width: 55, background: T.bg3 || T.bg2, color, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${color}55`, borderRadius: 2, padding: "1px 4px" }} />
                            <span style={{ fontSize: 9, color, fontFamily: FONT_UI, fontWeight: 900, width: 14, flexShrink: 0 }}>%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ width: 1, background: T.panelBorder, flexShrink: 0 }} />

                    {/* Col 5: Rarity ramp — 245px */}
                    <div style={{ width: 245, flexShrink: 0, padding: 10 }}>
                      <label style={LBL}>RARITY RAMP</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        {[["SET A", "startRarCommon", "startRarUncommon", "startRarRare", "startRarLegendary", T.silverDim], ["SET Z", "endRarCommon", "endRarUncommon", "endRarRare", "endRarLegendary", T.silverBright]].map(([label, ck, uk, rk, lk, color]) => (
                          <div key={label} style={{ padding: "4px 6px", background: T.bg2, borderRadius: 3, border: `1px solid ${color}28` }}>
                            <div style={{ fontSize: 7, color, fontFamily: FONT_UI, fontWeight: 800, marginBottom: 3 }}>{label}</div>
                            {[[ck, "C", RC.common], [uk, "U", RC.uncommon], [rk, "R", RC.rare], [lk, "L", RC.legendary]].map(([k, lb, rc]) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
                                <span style={{ fontSize: 7, color: rc, fontFamily: FONT_UI, fontWeight: 800, width: 8, flexShrink: 0 }}>{lb}</span>
                                <input type="number" min="0" max="100" value={camGen[k]} onChange={e => setCamGen(p => ({ ...p, [k]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))} style={{ width: 55, background: T.bg3 || T.bg2, color: rc, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${rc}55`, borderRadius: 2, padding: "1px 4px" }} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>

                {/* ── Preview table ── */}
                <div style={{ padding: "8px 10px", background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 4 }}>
                  <label style={LBL}>SET PROGRESSION PREVIEW</label>
                  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 480, marginTop: 6 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT_UI, minWidth: 640 }}>
                      <thead style={{ position: "sticky", top: 0, background: T.panel, zIndex: 1 }}>
                        <tr style={{ borderBottom: `1px solid ${T.panelBorder}` }}>
                          {[["Set", T.textDim], ["Ent.Pwr", T.being], ["E.±", T.being], ["Bless", TC.bless], ["Curse", TC.curse], ["Equip", TC.equip], ["Terr", TC.field], ["Cards", T.textDim], ["C%", RC.common], ["U%", RC.uncommon], ["R%", RC.rare], ["L%", RC.legendary]].map(([h, color]) => (
                            <th key={h} style={{ textAlign: "left", padding: "4px 8px", color, fontWeight: 700, fontSize: 9, letterSpacing: 1, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {campaignPreview.map(({ setId, si, cards, powerMin, powerMax, blessPwrMin, blessPwrMax, cursePwrMin, cursePwrMax, equipPwrMin, equipPwrMax, terrPwrMin, terrPwrMax, rarCommon, rarUncommon, rarRare, rarLegendary }) => {
                          const setObj = sets.find(s => s.id === setId);
                          const totalW = rarCommon + rarUncommon + rarRare + rarLegendary || 1;
                          const statMax = Math.min(STAT_MAX, powerMax);
                          return (
                            <tr key={setId} style={{ background: si % 2 === 0 ? T.bg2 : "transparent", borderBottom: `1px solid ${T.panelBorder}28` }}>
                              <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                                <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 2, background: setObj?.color || T.panel, marginRight: 6, verticalAlign: "middle" }} />
                                <span style={{ color: T.textBright, fontWeight: 800 }}>{setObj?.name || setId}</span>
                              </td>
                              <td style={{ padding: "5px 8px", color: T.being, fontWeight: 700 }}>{powerMin}–{powerMax}</td>
                              <td style={{ padding: "5px 8px", color: T.being }}>±{statMax}</td>
                              <td style={{ padding: "5px 8px", color: TC.bless, fontWeight: 700 }}>{blessPwrMin}–{blessPwrMax}C</td>
                              <td style={{ padding: "5px 8px", color: TC.curse, fontWeight: 700 }}>{cursePwrMin}–{cursePwrMax}C</td>
                              <td style={{ padding: "5px 8px", color: TC.equip }}>±{equipPwrMin}–{equipPwrMax}</td>
                              <td style={{ padding: "5px 8px", color: TC.field }}>±{terrPwrMin}–{terrPwrMax}×2</td>
                              <td style={{ padding: "5px 8px", color: cards !== camGen.cardsPerSet ? T.silverBright : T.textDim, fontWeight: cards !== camGen.cardsPerSet ? 800 : 400 }}>{cards}</td>
                              <td style={{ padding: "5px 8px", color: RC.common, fontWeight: 700 }}>{Math.round(rarCommon / totalW * 100)}%</td>
                              <td style={{ padding: "5px 8px", color: RC.uncommon, fontWeight: 700 }}>{Math.round(rarUncommon / totalW * 100)}%</td>
                              <td style={{ padding: "5px 8px", color: RC.rare, fontWeight: 700 }}>{Math.round(rarRare / totalW * 100)}%</td>
                              <td style={{ padding: "5px 8px", color: RC.legendary, fontWeight: 700 }}>{Math.round(rarLegendary / totalW * 100)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 7, color: T.textDim, fontFamily: FONT_UI }}>
                    {campaignPreview.reduce((s, r) => s + r.cards, 0)} total placeholder cards · blank names & art · ready to customize
                  </div>
                </div>
              </div>
            ) : null}
            {forgeMode === "decks" && (() => {
              const { count, deckSize, factionMode } = autoGenCfg;
              const ds = deckSize;
              const STRATS = [
                ["Balanced", 0.60, 0.20, 0.15, 0.35],
                ["Aggro",    0.65, 0.14, 0.16, 0.20],
                ["Control",  0.50, 0.30, 0.15, 0.50],
                ["Tempo",    0.55, 0.20, 0.20, 0.25],
              ];
              const toRoman = n => { const v=[1000,900,500,400,100,90,50,40,10,9,5,4,1],s=["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"]; let r=""; v.forEach((val,i)=>{ while(n>=val){r+=s[i];n-=val;} }); return r; };
              const lbl = { fontFamily: FONT_UI, fontSize: 9, fontWeight: 800, color: T.silver, letterSpacing: 2 };
              const pill = (active, col) => ({
                padding: "2px 7px", borderRadius: 2, cursor: "pointer", fontFamily: FONT_UI, fontSize: 10, fontWeight: 800,
                border: `1px solid ${active ? (col || T.silverBright) : T.panelBorder}`,
                background: active ? (col || T.silver) + "18" : "transparent",
                color: active ? (col || T.silverBright) : T.textDim,
              });
              const previews = Array.from({ length: Math.min(count, 16) }, (_, i) => {
                const [arch, entPct, bcPct, equPct, oneCR] = STRATS[i % STRATS.length];
                const faction = count === 1 ? (factionMode === "curse" ? "curse" : factionMode === "rand" ? "random" : "bless") : (i % 2 === 0 ? "bless" : "curse");
                const bcSlots = Math.max(5, Math.round(ds * bcPct));
                const equSlots = Math.max(3, Math.round(ds * equPct));
                const terrSlots = 2;
                const entSlots = Math.max(4, ds - bcSlots - equSlots - terrSlots);
                const oneCSlots = Math.round(bcSlots * oneCR);
                return { name: toRoman(decks.length + i + 1), arch, faction, entSlots, bcSlots, oneCSlots, highCSlots: bcSlots - oneCSlots, equSlots, terrSlots, total: entSlots + bcSlots + equSlots + terrSlots };
              });
              const fCol = f => f === "bless" ? T.bless : f === "curse" ? T.curse : T.silver;
              const fSym = f => f === "bless" ? "△" : f === "curse" ? "▽" : "✡";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Config row */}
                  <div style={{ padding: "9px 12px", background: "#07070a", border: `1px solid ${T.silverDim}45`, borderRadius: 3, display: "flex", flexDirection: "column", gap: 7, width: "fit-content" }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={lbl}>DECKS</span>
                      {[1, 2, 4, 8, 16, 32, 64].map(n => (
                        <button key={n} onClick={() => setAutoGenCfg(p => ({ ...p, count: n }))} style={pill(count === n)}>{n}</button>
                      ))}
                      <span style={{ ...lbl, marginLeft: 6 }}>SIZE</span>
                      <input type="number" min={20} max={80} key={ds} defaultValue={ds}
                        onBlur={e => setAutoGenCfg(p => ({ ...p, deckSize: Math.max(20, Math.min(80, parseInt(e.target.value) || 30)) }))}
                        style={{ width: 42, background: "transparent", color: T.silverBright, fontFamily: FONT_UI, fontWeight: 900, fontSize: 11, border: `1px solid ${T.panelBorder}`, borderRadius: 2, padding: "2px 5px", outline: "none" }} />
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {count === 1 ? (
                        [["bless", "△ Ascension", T.bless], ["curse", "▽ Corruption", T.curse], ["rand", "✡ Fated", T.silver]].map(([v, l, col]) => (
                          <button key={v} onClick={() => setAutoGenCfg(p => ({ ...p, factionMode: v }))} style={{ ...pill(factionMode === v, col), boxShadow: factionMode === v ? `0 0 10px ${col}28` : "none" }}>{l}</button>
                        ))
                      ) : (
                        <span style={{ fontSize: 9, color: T.silver, fontFamily: FONT_UI }}>△ ×{count / 2} · ▽ ×{count / 2}</span>
                      )}
                      <button onClick={() => setAutoGenCfg(p => ({ ...p, artOnly: !p.artOnly }))} style={{ ...pill(autoGenCfg.artOnly, T.silverBright), marginLeft: 6 }}>Art Only</button>
                      <button onClick={generateStructureDecks} style={{ ...pill(true), marginLeft: 4, padding: "3px 18px", letterSpacing: 3, fontSize: 11, color: T.silverBright, border: `1px solid ${T.silverDim}` }}>BUILD</button>
                      <button
                        disabled={simulating || decks.length < 2}
                        onClick={async () => {
                          setSimulating(true);
                          try {
                            const res = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ games: 200 }) });
                            const data = await res.json();
                            if (data.results) {
                              setDecks(prev => prev.map(d => {
                                const match = data.results.find(r => r.name === d.name);
                                if (!match) return d;
                                const clean = d.name.replace(/\s*\(\d+\.?\d*%\)$/, "");
                                return { ...d, name: `${clean} (${match.score.toFixed(1)}%)` };
                              }));
                            }
                          } catch (e) { console.error("Simulate failed:", e); }
                          setSimulating(false);
                        }}
                        style={{
                          ...pill(!simulating && decks.length >= 2, T.bless), marginLeft: 4, padding: "3px 18px", letterSpacing: 3, fontSize: 11,
                          color: simulating || decks.length < 2 ? T.textDim : T.bless,
                          border: `1px solid ${simulating || decks.length < 2 ? T.panelBorder : T.bless}`,
                          opacity: simulating || decks.length < 2 ? 0.5 : 1,
                          animation: simulating ? "pulse 1.5s ease-in-out infinite" : "none",
                        }}
                      >{simulating ? "SIMULATING..." : "SIMULATE"}</button>
                    </div>
                  </div>
                  {/* Preview grid — wraps to next line naturally */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {previews.map((p, i) => (
                      <div key={i} style={{ width: 100, flexShrink: 0, background: T.panel, border: `1px solid ${T.panelBorder}`, borderRadius: 3, overflow: "hidden" }}>
                        {/* Header */}
                        <div style={{ padding: "5px 8px", borderBottom: `1px solid ${T.panelBorder}`, background: fCol(p.faction) + "10" }}>
                          <div style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 900, color: fCol(p.faction), letterSpacing: 1 }}>{p.name} {fSym(p.faction)}</div>
                          <div style={{ fontFamily: FONT_UI, fontSize: 7, color: T.textDim, marginTop: 1, letterSpacing: 1 }}>{p.arch.toUpperCase()}</div>
                        </div>
                        {/* Stats */}
                        <div style={{ padding: "5px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                          {[
                            ["Total",   p.total,             T.silverBright, true],
                            ["Being",  `${p.entSlots} ±2`,  TC.being,      false],
                            ["Spell",   `${p.bcSlots} ±2`,   fCol(p.faction),false],
                            [" 1C",     `~${p.oneCSlots}`,   T.textDim,      false],
                            [" Hi-C",   `~${p.highCSlots}`,  T.textDim,      false],
                            ["Equip",   `${p.equSlots} ±2`,  TC.equip,       false],
                            ["Field", p.terrSlots,          TC.field,     false],
                          ].map(([lbl, v, c, bold]) => (
                            <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <span style={{ fontFamily: FONT_UI, fontSize: 7, color: T.textDim, fontWeight: 700 }}>{lbl}</span>
                              <span style={{ fontFamily: FONT_UI, fontSize: bold ? 10 : 8, color: c, fontWeight: bold ? 900 : 500 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        {/* Ratio bar */}
                        <div style={{ display: "flex", height: 5, margin: "0 8px 7px" }}>
                          <div style={{ flex: p.entSlots, background: TC.being, opacity: 0.85 }} />
                          <div style={{ flex: p.bcSlots, background: fCol(p.faction), opacity: 0.85 }} />
                          <div style={{ flex: p.equSlots, background: TC.equip, opacity: 0.85 }} />
                          <div style={{ flex: p.terrSlots, background: TC.field, opacity: 0.85 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
  );
}
