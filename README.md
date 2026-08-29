# Sentinel

Deteccion de incidentes en video en tiempo real, **zero-shot y multi-dominio**.
Un mismo sistema cubre robo en tienda, agresiones, seguridad industrial y caidas
sin entrenar un modelo por vertical: cambiar de dominio es cambiar un YAML.

---

## Por que no entrenamos un modelo

Es la pregunta que hara el jurado. La respuesta corta: la literatura de 2025-2026
dice que no hace falta, y los datasets publicos de robo son una trampa.

| Enfoque | Problema |
|---|---|
| Detector de objetos con clase "shoplifting" (Roboflow) | Un detector no ve *acciones*. Aprende el fondo de la tienda del dataset y no generaliza a otra camara |
| CNN 3D sobre UCF-Crime / DCSASS | El subset de robo es pequeno y de CCTV degradada. Entrenado ahi, en una demo en vivo no dispara nunca |
| VLM zero-shot orquestado | Es el estado del arte actual y no necesita anotacion |

Referencias que sostienen la decision:

- **LAVIDA** — 82.18% AUC en UCF-Crime *sin datos de anomalias*. [arXiv](https://arxiv.org/html/2602.19248v1)
- **ASK-HINT** — prompting estructurado, SOTA training-free. [WACV 2026](https://openaccess.thecvf.com/content/WACV2026/papers/Zou_Unlocking_Vision-Language_Models_for_Video_Anomaly_Detection_via_Fine-Grained_Prompting_WACV_2026_paper.pdf)
- **Paza-AI** — YOLO + tracking + VLM, model-agnostic y sin fine-tuning. [arXiv](https://arxiv.org/pdf/2604.14846)
- **Veesion** (referencia comercial) — 85-90% de precision en alertas, o sea 1 de cada 7 es falsa. Ese es el techo real del sector.

---

## Arquitectura: cascada de 3 etapas

Mandar todos los frames a un VLM es inviable por coste, latencia y rate limit.
La cascada resuelve las tres cosas a la vez.

```
Camara (webcam / archivo / RTSP)
  |
  +-- ETAPA 0   siempre, ~30 FPS, local, coste 0
  |   YOLO11-pose + ByteTrack -> tracks con 17 keypoints
  |   Buffer circular de 12 s en RAM (JPEG, ~30 KB/frame)
  |
  +-- ETAPA 1   filtro geometrico -- descarta la inmensa mayoria
  |   senales normalizadas por el torso: concealment, motion, proximity,
  |   fall, immobility, dwell, zone, presence
  |   score ponderado por dominio -> sostenido -> dispara
  |
  +-- ETAPA 2   VLM, solo en disparos (~1 cada 15-45 s por persona)
  |   10 frames del buffer con el sujeto marcado -> Gemini -> JSON validado
  |
  +-- ETAPA 3   evento, clip de evidencia, WebSocket, feedback humano
```

Que gana cada etapa: la 0 y la 1 dan el "tiempo real" honesto; la 2 da la
explicacion en lenguaje natural que un operador puede leer y auditar; la 3
cierra el bucle con la persona que decide.

**Sesgo.** El sistema no usa biometria ni reconocimiento facial. La Etapa 1 solo
mide geometria corporal, y al VLM se le prohibe explicitamente razonar sobre
raza, genero, edad o vestimenta. Cada alerta guarda su evidencia textual, asi
que es auditable a posteriori.

---

## Dominios

Cada vertical es un YAML en `backend/domains/`. Anadir una no toca Python.

| Dominio | Senales que pesan | Dispara con |
|---|---|---|
| `retail_theft` | concealment 0.62, dwell 0.26, motion 0.12 | mano que alcanza un estante y vuelve al torso |
| `violence` | motion 0.55, proximity 0.45 | energia alta + dos personas cerca |
| `fall_detection` | fall 0.62, immobility 0.38 | caida no controlada + no levantarse |
| `industrial_safety` | presence, dwell, zone, fall | auditoria periodica de EPP y zonas restringidas |

---

## Puesta en marcha

```powershell
# 1. Dependencias
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
cd frontend; npm install; cd ..
```

> **Sobre la GPU.** `requirements.txt` trae torch desde PyPI, que en Windows es
> CPU-only. YOLO11n-pose en CPU da 10-15 FPS, de sobra para la Etapa 0. Para usar
> la GPU hace falta el indice propio de PyTorch:
>
> ```powershell
> .venv\Scripts\python.exe -m pip install --force-reinstall torch torchvision --index-url https://download.pytorch.org/whl/cu124
> ```
>
> Ese indice se quedo colgado a 0 bytes en la red de la hackathon. Si no baja, no
> insistas: deja `SENTINEL_DEVICE=cpu` y sigue. La GPU no es el cuello de botella
> de este sistema, la latencia del VLM lo es.

```powershell
# 2. Configuracion
copy .env.example .env      # y pon tu GEMINI_API_KEY

# 3. Arrancar los dos servicios
.\dev.ps1
```

- Dashboard: <http://localhost:5173>
- API: <http://localhost:8000/api/state>

Sin `GEMINI_API_KEY` el pipeline arranca igual en **modo offline**: todo funciona
salvo el veredicto real, que se sustituye por uno sintetico. Sirve para
desarrollar sin gastar cuota.

### Variables

| Variable | Por defecto | Para que |
|---|---|---|
| `GEMINI_API_KEY` | — | Key de [AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-3.7-flash` | Modelo de la Etapa 2 |
| `SENTINEL_SOURCE` | `0` | Indice de webcam, ruta a un `.mp4` o URL RTSP |
| `SENTINEL_DOMAIN` | `retail_theft` | Dominio inicial |
| `SENTINEL_DEVICE` | `cuda` | `cuda` o `cpu` |

Poner `SENTINEL_SOURCE` a un archivo lo reproduce **en bucle**: es el plan B para
la demo si la camara falla o la sala esta demasiado llena.

---

## Medir antes de presentar

```powershell
.venv\Scripts\python.exe -m tools.bench data\samples --domain retail_theft
```

Espera una carpeta con clips nombrados `pos_*.mp4` (hay incidente) y `neg_*.mp4`
(no lo hay), y devuelve precision, recall y cuantas llamadas al VLM ahorro el
filtro de la Etapa 1. Ese ultimo numero es el argumento economico del proyecto.

---

## API

| Metodo | Ruta | Que hace |
|---|---|---|
| GET | `/api/state` | FPS, personas, senales vivas, estadisticas |
| GET | `/api/domains` | Dominios cargados y sus pesos |
| POST | `/api/domain/{id}` | Cambia de vertical en caliente |
| GET | `/api/events` | Historial de eventos |
| POST | `/api/events/{id}/feedback` | `confirmed` o `false_positive` |
| GET | `/video.mjpg` | Video anotado en vivo |
| WS | `/ws` | Estado cada 500 ms y eventos al vuelo |
