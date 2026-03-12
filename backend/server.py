"""
Trinity Backend — JSON-file persistence + image uploads.

Run:  uvicorn server:app --reload --port 4000
Data: ./data/*.json  (auto-created on first write)
Docs: http://localhost:4000/docs
"""

import json, os, shutil, uuid, logging
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("trinity")

app = FastAPI(title="Trinity API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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
    return {
        "cards": read_json("cards", []),
        "decks": read_json("decks", []),
        "sets": read_json("sets", []),
        "collection": read_json("collection", {}),
        "tokens": read_json("tokens", 2),
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

# ═══ Individual endpoints ═══

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

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...), card_id: Optional[str] = Form(None)):
    img_dir = PUBLIC / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
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
