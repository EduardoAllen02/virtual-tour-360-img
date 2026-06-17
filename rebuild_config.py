import json, os

OUT = r"C:\Users\Yeyian PC\Documents\VSCodeProjects\virtual-tour-360-img\frames-web"
CFG = r"C:\Users\Yeyian PC\Documents\VSCodeProjects\virtual-tour-360-img\tour-config.json"

files = sorted(
    [fn for fn in os.listdir(OUT) if fn.endswith(".jpg")],
    key=lambda x: int(x.replace("frame_", "").replace(".jpg", ""))
)
frame_list = [f"frames-web/{fn}" for fn in files]
total = len(frame_list)
print(f"Frames: {total}  |  primero: {frame_list[0]}  |  ultimo: {frame_list[-1]}")

with open(CFG, "r", encoding="utf-8") as fh:
    cfg = json.load(fh)

cfg["frames"] = frame_list

# Reposition POIs for 246 frames
cfg["pois"] = [
    {"id": "salida",     "label": "Inicio del recorrido", "frame": 0,   "cameraAngle": {"lon": 0,   "lat": 0},   "description": "Punto de salida"},
    {"id": "tramo1",     "label": "Primer tramo",         "frame": 49,  "cameraAngle": {"lon": -20, "lat": -10}, "description": "Adentrando en el rio"},
    {"id": "tramo2",     "label": "Tramo central",        "frame": 98,  "cameraAngle": {"lon": 40,  "lat": 5},   "description": "Vista de ambas orillas"},
    {"id": "panoramica", "label": "Vista panoramica",     "frame": 157, "cameraAngle": {"lon": 0,   "lat": 10},  "description": "Horizonte del rio"},
    {"id": "llegada",    "label": "Llegada",              "frame": 216, "cameraAngle": {"lon": 0,   "lat": 0},   "description": "Final del recorrido"},
]
cfg["overlays"][0]["frameEnd"]   = 49
cfg["overlays"][1]["frameStart"] = 49;  cfg["overlays"][1]["frameEnd"]   = 98
cfg["overlays"][2]["frameStart"] = 98;  cfg["overlays"][2]["frameEnd"]   = 157
cfg["overlays"][3]["frameStart"] = 157; cfg["overlays"][3]["frameEnd"]   = 216

with open(CFG, "w", encoding="utf-8") as fh:
    json.dump(cfg, fh, indent=2, ensure_ascii=False)
print("Config actualizado. Tour listo.")
