import { FONT_TITLE, FONT_UI, THEME as T, RARITY_COLORS as RC } from "../theme.js";
import { Card } from "../components.jsx";

export default function PacksTab({
  sets, selSI, setSelSI, tokens, tokenFlash, ripPack,
  packRes, setPackRes, packFlip, setPackFlip, packSp, setPackSp, PACK_COST,
}) {
  return (
          <div style={{ animation: "fadeIn .3s", zoom: 1.5 }}>
            {(() => {
              const packCost = sets[selSI]?.cost_per_pack ?? PACK_COST; return (<>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h2 style={{ fontFamily: FONT_UI, fontSize: 12, color: T.silverBright, letterSpacing: 3, margin: 0, fontWeight: 900 }}>PACKS</h2>
                  <div style={{ fontFamily: FONT_UI, fontSize: 10, color: tokens >= packCost ? T.silverBright : T.curse, fontWeight: 800, animation: tokenFlash ? "tokenGold 0.7s ease-out forwards" : "none" }}>{tokens} TOKENS</div>
                </div>
                <div style={{ display: "flex", gap: 5, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
                  {sets.map((s, i) => (
                    <div key={s.id} onClick={() => { if (selSI === i && packRes.length > 0) { ripPack(s); } else { setSelSI(i); setPackRes([]); setPackFlip([]); setPackSp([]); } }} title={s.name}
                      style={{
                        width: 36, height: 36, borderRadius: 4, cursor: "pointer", flexShrink: 0,
                        background: s.color || T.panel,
                        border: `2px solid ${selSI === i ? T.white : "transparent"}`,
                        boxShadow: selSI === i ? `0 0 10px ${s.color || T.silver}99` : "0 1px 3px #00000066",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "box-shadow 0.15s, border-color 0.15s",
                        animation: selSI === i ? "subtlePulse 2.4s ease-in-out infinite" : "none",
                      }}>
                      <span style={{ fontFamily: FONT_TITLE, fontSize: selSI === i ? 22 : 19, color: parseInt((s.color || "#888").slice(1), 16) > 0x888888 ? "#111" : "#eee", lineHeight: 1, userSelect: "none" }}>
                        {selSI === i ? "" : (s.name[0] || "?").toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, marginTop: 52 }}>
                  {!packRes.length ? (
                    <button onClick={() => sets[selSI]?.cardIds?.length && tokens >= packCost && ripPack(sets[selSI])}
                      disabled={!sets[selSI]?.cardIds?.length || tokens < packCost} style={{
                        padding: "10px 40px", background: "transparent", borderRadius: 3, letterSpacing: 4,
                        border: `1.5px solid ${sets[selSI]?.cardIds?.length && tokens >= packCost ? T.silverBright : T.panelBorder}`,
                        cursor: sets[selSI]?.cardIds?.length && tokens >= packCost ? "pointer" : "not-allowed",
                        fontFamily: FONT_TITLE, fontSize: 18,
                        color: sets[selSI]?.cardIds?.length && tokens >= packCost ? T.white : T.textDim,
                      }}>{!sets[selSI]?.cardIds?.length ? "Empty Set" : tokens >= packCost ? `Open Pack (${packCost} Token${packCost !== 1 ? "s" : ""})` : `Locked (${packCost} Token${packCost !== 1 ? "s" : ""})`}</button>
                  ) : (
                    <div style={{ display: "flex", gap: 16, flexWrap: "nowrap", justifyContent: "center" }}>
                      {packRes.map((card, i) => {
                        const rarShimmer = {
                          common: "shimmerCommon 2s ease-in-out infinite", uncommon: "shimmerUncommon 1.8s ease-in-out infinite",
                          rare: "shimmerRare 1.5s ease-in-out infinite", legendary: "shimmerLegendary 2s ease-in-out infinite"
                        };
                        return (<div key={i} onClick={() => {
                          setPackFlip(p => { const n = [...p]; n[i] = true; return n; });
                          if (card.rarity === "rare" || card.rarity === "legendary") setTimeout(() => setPackSp(p => { const n = [...p]; n[i] = true; return n; }), 100);
                        }}
                          style={{ cursor: "pointer", width: 144, height: 170, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", animation: packFlip[i] ? `packPop .4s ease-out ${i * .12}s both` : "none" }}>
                          {packFlip[i] ? (
                            <div style={{ textAlign: "center", animation: rarShimmer[card.rarity] || "none", borderRadius: 4, padding: 2 }}>
                              <Card card={card} sz={140} sparkle={packSp[i]} />
                              <div style={{
                                fontSize: 9, color: RC[card.rarity], fontFamily: FONT_UI, textTransform: "uppercase", fontWeight: 800, marginTop: 3, letterSpacing: 2,
                                textShadow: card.rarity === "legendary" ? `0 0 12px ${T.legendary}aa` : card.rarity === "rare" ? `0 0 8px ${T.silverBright}44` : "none"
                              }}>{card.rarity}</div></div>
                          ) : (
                            <div style={{
                              width: 140, height: 155, borderRadius: 3, border: `1.5px solid ${T.silverDim}22`,
                              background: T.card, display: "flex", alignItems: "center", justifyContent: "center"
                            }}>
                              <span style={{ fontFamily: FONT_TITLE, fontSize: 42, color: T.silverBright, lineHeight: 1 }}>T</span></div>)}
                        </div>);
                      })}</div>
                  )}
                </div></>);
            })()}
          </div>
  );
}
