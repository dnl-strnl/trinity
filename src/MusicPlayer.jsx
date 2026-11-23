import { useEffect, useRef } from "react";
import { parseYouTubeIds, loadYouTubeApi } from "./music.js";

// Background music from a list of YouTube links (Settings → Music). One hidden IFrame-API player loops
// the list as a playlist; videos whose owners disallow embedding are skipped.

export default function MusicPlayer({ links, on, volume, onTitle }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const ids = parseYouTubeIds(links);
  const key = ids.join(",");
  const live = useRef({ volume, onTitle });
  live.current = { volume, onTitle };

  // Built while music is on and torn down when it is switched off, so nothing loads for players who never use it
  useEffect(() => {
    if (!key || !on) return;
    let dead = false;
    const el = document.createElement("div");
    hostRef.current.appendChild(el);
    loadYouTubeApi().then(YT => {
      if (dead) return;
      playerRef.current = new YT.Player(el, {
        width: 200, height: 200,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: e => {
            e.target.setVolume(live.current.volume);
            e.target.setLoop(true);
            e.target.loadPlaylist(key.split(","));
          },
          onStateChange: e => { if (e.data === YT.PlayerState.PLAYING) live.current.onTitle?.(e.target.getVideoData?.().title || ""); },
          onError: e => e.target.nextVideo(), // 100 removed, 101/150 embedding disabled
        },
      });
    });
    return () => { dead = true; playerRef.current?.destroy?.(); playerRef.current = null; el.remove(); live.current.onTitle?.(""); };
  }, [key, on]);

  useEffect(() => { playerRef.current?.setVolume?.(volume); }, [volume]);

  // Browsers block sound until the page has been interacted with; retry on the first click/keypress
  useEffect(() => {
    if (!on || !key) return;
    const kick = () => {
      const p = playerRef.current;
      const st = p?.getPlayerState?.();
      if (st === -1 || st === 5 || st === 2) p.playVideo(); // unstarted / cued / paused: the browser refused to start it
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => { window.removeEventListener("pointerdown", kick); window.removeEventListener("keydown", kick); };
  }, [on, key]);

  return <div ref={hostRef} aria-hidden style={{ position: "fixed", right: 0, bottom: 0, width: 200, height: 200, opacity: 0, pointerEvents: "none", zIndex: -1, overflow: "hidden" }} />;
}
