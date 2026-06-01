# Virtual Tour 360° — Frames

Versión basada en imágenes (frames) en lugar de video.
Clon de `virtual-tour-360` adaptado para trabajar con frames extraídos con FrameExtractor.

## Flujo de trabajo

1. **Extraer frames** del video con `FrameExtractor` → guarda PNGs en `Downloads/`
2. **Mover los frames** a `virtual-tour-360-img/frames/`
3. **Levantar servidor** desde la raíz del proyecto:
   ```bash
   cd virtual-tour-360-img
   npx serve .
   # o:
   python -m http.server 8080
   ```
4. **POI Editor** → `http://localhost:3000/poi-editor/`
   - Clic en "Cargar frames" → selecciona todos los archivos de `frames/`
   - Navega con el slider o teclas ← →
   - Posiciona la cámara y presiona "Agregar POI"
   - Exporta `tour-config.json` → guarda en la raíz del proyecto
5. **Viewer** → `http://localhost:3000/viewer/`
   - Lee `tour-config.json` automáticamente
   - Tour listo

## Estructura de tour-config.json

```json
{
  "title": "Nombre del tour",
  "frames": [
    "frames/frame_000001_0.033s.png",
    "frames/frame_000050_1.667s.png"
  ],
  "pois": [
    {
      "id":          "sala-1",
      "label":       "Sala Principal",
      "frame":       0,
      "cameraAngle": { "lon": 45, "lat": 0 },
      "description": "Texto opcional"
    }
  ],
  "overlays": [
    {
      "id":         "precio-sofa",
      "type":       "price",
      "lon":        30,
      "lat":        5,
      "frameStart": 0,
      "frameEnd":   2,
      "data": {
        "title":       "Sofá Milano",
        "price":       "$12,500",
        "description": "Disponible en 3 colores",
        "action":      "Ver detalles"
      }
    }
  ]
}
```

## Diferencias vs virtual-tour-360 (video)

| Característica | virtual-tour-360 | virtual-tour-360-img |
|---|---|---|
| Fuente visual | `video` MP4 | `frames[]` PNGs |
| POI posición | `timestamp` (segundos) | `frame` (índice 0-based) |
| Overlay visibilidad | `timeStart / timeEnd` | `frameStart / frameEnd` |
| Navegación | scrubber continuo | scrubber por frame |
| Teclado viewer | — | ← → para frame a frame |

## Tipos de overlay
- `"type": "info"` — título + descripción + acción
- `"type": "price"` — título + precio + descripción + acción

## Coords esféricas (lon/lat)
- `lon`: grados horizontales (-180 a 180)
- `lat`: grados verticales, 0 = horizonte, + arriba, - abajo (-85 a 85)
- Usa el **POI Editor** para leer los valores de lon/lat en tiempo real
