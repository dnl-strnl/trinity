// Release gate. Everything exists under `npm run dev`; the live build (GitHub Pages) shows only what its
// phase has reached. `VITE_LIVE=1 npm run dev` previews the live shape locally.
export const DEV = import.meta.env.DEV && !import.meta.env.VITE_LIVE;

// Raise this to release the next phase.
export const RELEASE_PHASE = 0;

// The phase at which each tab goes live. A tab not listed here stays local (Duel, Editor).
const TAB_PHASE = { play: 0, browse: 0, decks: 0, rules: 0, packs: 1, create: 2 };
export const tabLive = id => DEV || TAB_PHASE[id] <= RELEASE_PHASE;

// Card art. Local dev gets it from the backend's cache of the art dataset (/images/<stem>.webp); the live
// build has no backend, so the browser loads the same file from the dataset itself.
const ART = "https://huggingface.co/datasets/dnl-strnl/dalle2exp-256/resolve/main/images/";
export const artUrl = image => (DEV || !image ? image : image.replace(/^\/images\//, ART));
