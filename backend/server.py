"""
Trinity Backend — JSON-file persistence + image uploads.

Run:  uvicorn server:app --reload --port 4000
Data: ./data/*.json  (auto-created on first write)
Docs: http://localhost:4000/docs
"""

import json, os, shutil, uuid, logging
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("trinity")

app = FastAPI(title="Trinity API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class GameManager:
    def __init__(self):
        self.players: Dict[str, WebSocket] = {}  # role ("p1" or "p2") -> socket
        self.decks: Dict[str, dict] = {}  # role -> deck object
        self.game_state: Optional[dict] = None
        self.spectators: List[WebSocket] = []
        self.aliases: Dict[str, str] = {}  # role -> emoji alias

    async def broadcast(self, data: dict):
        dead_roles = []
        for role, ws in self.players.items():
            try:
                await ws.send_json(data)
            except:
                dead_roles.append(role)
        for role in dead_roles:
            log.info(f"Removing dead player role: {role}")
            del self.players[role]

        dead_specs = []
        for ws in self.spectators:
            try:
                await ws.send_json(data)
            except:
                dead_specs.append(ws)
        for ws in dead_specs:
            self.spectators.remove(ws)

    def reset(self, hard=False):
        log.info(f"Resetting game manager state (hard={hard})")
        if hard:
            self.players = {}
        self.decks = {}
        self.game_state = None
        self.aliases = {}
        # Keep spectators unless hard reset
        if hard:
            self.spectators = []

gm = GameManager()

@app.websocket("/game-ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    log.info(f"Accepted WebSocket connection from {websocket.client}")

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "join":
                # First two get roles, others spectate
                if "p1" not in gm.players:
                    role = "p1"
                    gm.players[role] = websocket
                elif "p2" not in gm.players:
                    role = "p2"
                    gm.players[role] = websocket
                else:
                    role = "spectator"
                    gm.spectators.append(websocket)

                log.info(f"Client joined as: {role}")
                await websocket.send_json({
                    "type": "welcome",
                    "role": role,
                    "state": gm.game_state,
                    "taken": list(gm.players.keys())
                })
                await gm.broadcast({"type": "room_update", "taken": list(gm.players.keys())})

            elif msg_type == "select_deck":
                role = data.get("role")
                deck = data.get("deck")
                if role in gm.players:
                    gm.decks[role] = deck
                    log.info(f"Deck selected by {role}: {deck.get('name')}")
                    await gm.broadcast({
                        "type": "deck_selected",
                        "role": role,
                        "deck_name": deck.get("name"),
                        "deck_idx": data.get("deck_idx") # pass through index for easier sync
                    })

                    if len(gm.decks) == 2 and not gm.game_state:
                        log.info("Both decks selected, ready to start!")
                        await gm.broadcast({"type": "ready_to_start"})

            elif msg_type == "start_game":
                log.info("Starting duel...")
                gm.game_state = data.get("state")
                await gm.broadcast({"type": "game_start", "state": gm.game_state})

            elif msg_type == "sync_state":
                gm.game_state = data.get("state")
                response = {"type": "state_update", "state": gm.game_state}
                if "flash" in data: response["flash"] = data["flash"]
                if "sound" in data: response["sound"] = data["sound"]
                if "sender" in data: response["sender"] = data["sender"]
                # Relay to others only — sender already applied state locally
                for role, ws_conn in list(gm.players.items()):
                    if ws_conn != websocket:
                        try: await ws_conn.send_json(response)
                        except: pass
                for ws_conn in list(gm.spectators):
                    try: await ws_conn.send_json(response)
                    except: pass

            elif msg_type == "set_alias":
                role = data.get("role")
                alias = data.get("alias", "")
                if role in ("p1", "p2"):
                    gm.aliases[role] = alias
                    await gm.broadcast({"type": "alias_update", "role": role, "alias": alias})

            elif msg_type == "game_action":
                # Action-based sync: relay the action (+ pre-computed state) to the other player
                if "state" in data:
                    gm.game_state = data["state"]
                relay = {"type": "game_action", "action": data.get("action"), "state": gm.game_state, "seq": data.get("seq")}
                for role, ws_conn in list(gm.players.items()):
                    if ws_conn != websocket:
                        try: await ws_conn.send_json(relay)
                        except: pass
                for ws_conn in list(gm.spectators):
                    try: await ws_conn.send_json(relay)
                    except: pass

            elif msg_type in ["sync_anim", "sync_sfx"]:
                await gm.broadcast(data)

            elif msg_type == "reset":
                gm.reset(hard=data.get("hard", False))
                await gm.broadcast({"type": "game_reset"})

    except WebSocketDisconnect:
        role_to_remove = None
        for r, ws in gm.players.items():
            if ws == websocket:
                role_to_remove = r
                break
        if role_to_remove:
            log.info(f"Player {role_to_remove} disconnected")
            del gm.players[role_to_remove]
            if not gm.players: # if no players left, full reset
                gm.reset()
            await gm.broadcast({"type": "room_update", "taken": list(gm.players.keys())})
        elif websocket in gm.spectators:
            gm.spectators.remove(websocket)
            log.info("Spectator disconnected")


HERE = Path(__file__).parent  # resolve paths relative to this file
DATA = HERE / "data"
PUBLIC = HERE.parent / "public"  # public/ is sibling to backend/ - go up one level
DATA.mkdir(exist_ok=True)

def read_json(name, default=None):
    p = DATA / f"{name}.json"
    if p.exists():
        d = json.loads(p.read_text())
        log.info(f"READ {name}.json → {len(d) if isinstance(d, (list, dict)) else '?'} entries")
        return d
    log.info(f"READ {name}.json → not found, using default")
    return default if default is not None else []

def write_json(name, data):
    p = DATA / f"{name}.json"
    p.write_text(json.dumps(data, indent=2))
    size = len(data) if isinstance(data, (list, dict)) else "?"
    log.info(f"WRITE {name}.json → {size} entries ({p.stat().st_size} bytes)")
    return data

@app.get("/api/state")
def get_state():
    log.info("GET /api/state")
    audio_env = os.environ.get("TRINITY_AUDIO", "1")
    return {
        "cards": read_json("cards", []),
        "decks": read_json("decks", []),
        "sets": read_json("sets", []),
        "collection": read_json("collection", {}),
        "tokens": read_json("tokens", 2),
        "audio_enabled": audio_env == "1",
    }

@app.put("/api/state")
async def put_state(request: Request):
    body = await request.json()
    log.info(f"PUT /api/state — cards:{len(body.get('cards',[]))} decks:{len(body.get('decks',[]))} sets:{len(body.get('sets',[]))} coll:{len(body.get('collection',{}))} tokens:{int(body.get('tokens',0))}")
    if "cards" in body: write_json("cards", body["cards"])
    if "decks" in body: write_json("decks", body["decks"])
    if "sets" in body: write_json("sets", body["sets"])
    if "collection" in body: write_json("collection", body["collection"])
    if "tokens" in body: write_json("tokens", body["tokens"])
    return {"ok": True}


@app.get("/api/cards")
def get_cards(): return read_json("cards", [])

@app.put("/api/cards")
async def put_cards(request: Request):
    data = await request.json()
    return write_json("cards", data)

@app.get("/api/decks")
def get_decks(): return read_json("decks", [])

@app.put("/api/decks")
async def put_decks(request: Request):
    return write_json("decks", await request.json())

@app.get("/api/sets")
def get_sets(): return read_json("sets", [])

@app.put("/api/sets")
async def put_sets(request: Request):
    return write_json("sets", await request.json())

@app.get("/api/collection")
def get_collection(): return read_json("collection", {})

@app.put("/api/collection")
async def put_collection(request: Request):
    return write_json("collection", await request.json())

@app.get("/api/images/exists")
def image_exists(filename: str):
    p = PUBLIC / "images" / filename
    return {"exists": p.exists(), "path": f"/images/{filename}"}

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...), card_id: Optional[str] = Form(None), use_original_name: bool = Form(False)):
    img_dir = PUBLIC / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    if use_original_name:
        name = file.filename
    else:
        ext = Path(file.filename).suffix or ".png"
        name = f"{card_id or uuid.uuid4().hex[:8]}{ext}"
    dest = img_dir / name
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    log.info(f"UPLOAD image → {dest} ({dest.stat().st_size} bytes)")
    return {"path": f"/images/{name}", "card_id": card_id}

@app.post("/api/upload/video")
async def upload_video(file: UploadFile = File(...), card_id: Optional[str] = Form(None)):
    vid_dir = PUBLIC / "videos"
    vid_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix or ".mp4"
    name = f"{card_id or uuid.uuid4().hex[:8]}{ext}"
    dest = vid_dir / name
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    log.info(f"UPLOAD video → {dest} ({dest.stat().st_size} bytes)")
    return {"path": f"/videos/{name}", "card_id": card_id}

@app.post("/api/upload/bulk")
async def upload_bulk(files: list[UploadFile] = File(...), card_type: str = Form("entity")):
    img_dir = PUBLIC / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for file in files:
        ext = Path(file.filename).suffix or ".png"
        name = f"{uuid.uuid4().hex[:8]}{ext}"
        dest = img_dir / name
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        results.append({"path": f"/images/{name}", "original": file.filename, "type": card_type})
    log.info(f"UPLOAD bulk → {len(results)} files for type={card_type}")
    return results

@app.get("/api/export")
def export_all():
    log.info("EXPORT all state")
    return get_state()

@app.post("/api/import")
async def import_all(request: Request):
    state = await request.json()
    log.info(f"IMPORT all state — {len(state)} keys")
    return await put_state(request)

@app.get("/api/health")
def health():
    files = [f.name for f in DATA.glob("*.json")]
    log.info(f"HEALTH check — {len(files)} data files: {files}")
    return {"status": "ok", "data_dir": str(DATA), "public_dir": str(PUBLIC), "files": files}

@app.on_event("startup")
async def startup():
    log.info(f"Trinity backend starting:")
    log.info(f"  data: {DATA}")
    log.info(f"  public: {PUBLIC}")
    log.info(f"  files: {[f.name for f in DATA.glob('*.json')]}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)
