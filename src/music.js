// YouTube background-music helpers for MusicPlayer.jsx

// Accepts watch / youtu.be / shorts / embed / music.youtube links or bare 11-character IDs, one per line or
// separated by spaces/commas. Lines starting with # are comments; anything else unrecognised is ignored.
export function parseYouTubeIds(text) {
  const ids = [];
  const body = (text || "").split("\n").filter(l => !l.trim().startsWith("#")).join("\n");
  for (const raw of body.split(/[\s,]+/)) {
    if (!raw) continue;
    if (/^[\w-]{11}$/.test(raw)) { ids.push(raw); continue; }
    let u;
    try { u = new URL(raw.includes("://") ? raw : "https://" + raw); } catch { continue; }
    const id = u.hostname.endsWith("youtu.be") ? u.pathname.slice(1)
      : u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1];
    if (id && /^[\w-]{11}$/.test(id.slice(0, 11))) ids.push(id.slice(0, 11));
  }
  return ids;
}

let apiPromise = null;
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) apiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}
