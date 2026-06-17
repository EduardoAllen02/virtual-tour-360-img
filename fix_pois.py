import json
CFG = r"C:\Users\Yeyian PC\Documents\VSCodeProjects\virtual-tour-360-img\tour-config.json"
with open(CFG, "r", encoding="utf-8") as fh:
    cfg = json.load(fh)

cfg["pois"] = [
    {"id": "salida",     "label": "Inicio del recorrido", "frame": 0,   "cameraAngle": {"lon": 0,   "lat": 0},   "description": "Punto de salida"},
    {"id": "tramo1",     "label": "Primer tramo",         "frame": 32,  "cameraAngle": {"lon": -20, "lat": -10}, "description": "Adentrando en el rio"},
    {"id": "tramo2",     "label": "Tramo central",        "frame": 65,  "cameraAngle": {"lon": 40,  "lat": 5},   "description": "Vista de ambas orillas"},
    {"id": "panoramica", "label": "Vista panoramica",     "frame": 98,  "cameraAngle": {"lon": 0,   "lat": 10},  "description": "Horizonte del rio"},
    {"id": "llegada",    "label": "Llegada",              "frame": 130, "cameraAngle": {"lon": 0,   "lat": 0},   "description": "Final del recorrido"},
]
cfg["overlays"][0]["frameEnd"]   = 32
cfg["overlays"][1]["frameStart"] = 32
cfg["overlays"][1]["frameEnd"]   = 65
cfg["overlays"][2]["frameStart"] = 65
cfg["overlays"][2]["frameEnd"]   = 98
cfg["overlays"][3]["frameStart"] = 98
cfg["overlays"][3]["frameEnd"]   = 130

with open(CFG, "w", encoding="utf-8") as fh:
    json.dump(cfg, fh, indent=2, ensure_ascii=False)
print("POIs y overlays actualizados para 163 frames.")
