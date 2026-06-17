"""
Extrae cada 2do frame del video 360 y los optimiza a <1MB para web.
Uso: python extract_frames.py
"""
import cv2
import os
import io
import json
import sys
from PIL import Image
from pathlib import Path

VIDEO_PATH  = r"C:\Users\Yeyian PC\Downloads\041.mp4"
OUT_DIR     = r"C:\Users\Yeyian PC\Documents\VSCodeProjects\virtual-tour-360-img\frames-web"
CONFIG_PATH = r"C:\Users\Yeyian PC\Documents\VSCodeProjects\virtual-tour-360-img\tour-config.json"
MAX_MB      = 1.0   # target max size per frame
QUALITY_INI = 68    # starting JPEG quality (drops automatically if frame too large)

os.makedirs(OUT_DIR, exist_ok=True)

cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print("ERROR: No se pudo abrir el video.")
    sys.exit(1)

fps         = cap.get(cv2.CAP_PROP_FPS)
total       = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"Video: {total} frames @ {fps:.2f}fps — extracting every 2nd frame (~{total//2} frames)")

frame_list  = []
frame_num   = 0
saved       = 0
errors      = 0

while True:
    ret, bgr = cap.read()
    if not ret:
        break

    if frame_num % 2 == 0:   # frame sí, frame no
        seconds  = frame_num / fps
        filename = f"frame_{frame_num:06d}_{seconds:.3f}s.jpg"
        out_path = os.path.join(OUT_DIR, filename)

        img = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

        quality = QUALITY_INI
        while quality >= 25:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality,
                     optimize=True, progressive=True, subsampling=2)
            if buf.tell() / 1_048_576 <= MAX_MB:
                break
            quality -= 5

        buf.seek(0)
        try:
            with open(out_path, "wb") as fh:
                fh.write(buf.read())
            frame_list.append(f"frames-web/{filename}")
            saved += 1
        except OSError as e:
            errors += 1
            print(f"  ERROR al guardar {filename}: {e}")

        if saved % 100 == 0:
            size_kb = buf.tell() / 1024
            print(f"  [{saved}] frame {frame_num} — {seconds:.1f}s — {size_kb:.0f}KB (Q{quality})")

    frame_num += 1

cap.release()

# ── Actualizar tour-config.json ──────────────────────────────
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    config = json.load(f)

config["frames"] = frame_list

with open(CONFIG_PATH, "w", encoding="utf-8") as f:
    json.dump(config, f, indent=2, ensure_ascii=False)

print(f"\nListo: {saved} frames extraídos y optimizados.")
print(f"Errores: {errors}")
print(f"tour-config.json actualizado con {len(frame_list)} frames.")
print(f"NOTA: los POIs del config aún apuntan a índices de frame antiguos — ajústalos manualmente si es necesario.")
