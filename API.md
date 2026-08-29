# Contrato de API

Todo vive en `http://localhost:8000`. El front no necesita saber nada del
pipeline: se conecta al WebSocket, pinta lo que llega y hace POST para actuar.

En desarrollo, Vite ya proxea `/api`, `/ws`, `/clips` y `/video.mjpg` al 8000,
asi que desde el front basta con rutas relativas.

---

## 1. WebSocket — la fuente principal

```js
const ws = new WebSocket(`ws://${location.host}/ws`)
ws.onmessage = (raw) => {
  const msg = JSON.parse(raw.data)
  // msg.type: "state" | "bootstrap" | "event"
}
```

Al conectar llegan dos mensajes seguidos: un `state` y un `bootstrap` con el
historial. Despues, `state` cada 500 ms y `event` cada vez que algo cambia.
Si el socket se cae, reconectar: el `bootstrap` vuelve a dejar el front al dia.

### `state` — cada 500 ms

```json
{
  "type": "state",
  "state": {
    "status": "running",
    "fps": 14.2,
    "domain": "retail_theft",
    "domain_label": "Robo en tienda",
    "threshold": 0.52,
    "people": 2,
    "analyzing": 1,
    "offline": false,
    "error": null,
    "tracks": [
      { "id": 7, "score": 0.61, "signals": { "concealment": 0.82, "dwell": 0.4, "motion": 0.05 } }
    ],
    "stats": {
      "triggers": 12, "incidents": 3, "dismissed_by_vlm": 9,
      "confirmed": 2, "false_positives": 1,
      "precision": 0.667, "avg_latency_ms": 2840
    }
  }
}
```

| Campo | Notas para la UI |
|---|---|
| `status` | `stopped`, `starting`, `running`, `paused`. Fuera de `running` no hay video |
| `analyzing` | Cuantas llamadas al VLM hay en vuelo ahora mismo |
| `offline` | `true` = sin `GEMINI_API_KEY`, los veredictos son sinteticos. Conviene avisarlo |
| `tracks[].score` | 0-1. Comparar contra `threshold` para pintar a la persona en rojo |
| `tracks[].signals` | Las senales del dominio activo. Cambian al cambiar de dominio |
| `stats.precision` | `null` hasta que haya al menos un feedback humano |

### `bootstrap` — una vez al conectar

```json
{ "type": "bootstrap", "events": [ /* array de Event, mas reciente primero */ ] }
```

### `event` — al vuelo

```json
{ "type": "event", "event": { /* un Event */ } }
```

Llega **dos veces** por incidente: primero con `status: "analyzing"` (el gate
disparo) y despues con el veredicto. **Reemplazar por `id`, no anadir**:

```js
setEvents(prev => [msg.event, ...prev.filter(e => e.id !== msg.event.id)])
```

---

## 2. El objeto `Event`

```json
{
  "id": "a3f9c1b027",
  "domain": "retail_theft",
  "track_id": 7,
  "created_at": 1756468800.42,
  "gate_score": 0.61,
  "signals": { "concealment": 0.82, "dwell": 0.4, "motion": 0.05 },
  "status": "incident",
  "verdict": {
    "incident": true,
    "incident_type": "ocultamiento de producto",
    "confidence": 0.78,
    "evidence": "El sujeto toma un envase del estante y lo introduce bajo la chaqueta.",
    "recommended_action": "Avisar al personal de sala antes de la salida."
  },
  "frames": ["a3f9c1b027_00.jpg", "a3f9c1b027_01.jpg", "..."],
  "feedback": null,
  "latency_ms": 2840
}
```

| `status` | Que paso | Como pintarlo |
|---|---|---|
| `analyzing` | El gate disparo, el VLM esta mirando | Naranja, spinner. `verdict` y `frames` aun vacios |
| `incident` | El VLM confirma | Rojo. Es la alerta de verdad |
| `dismissed` | El VLM lo descarta | Gris. **No lo escondas**: es la prueba de que la cascada filtra |
| `error` | Fallo la llamada | Neutro |

`created_at` es epoch en **segundos** (float) — en JS hay que multiplicar por 1000.

`frames` son nombres de archivo, no URLs: componer `/clips/{nombre}`. Vienen en
orden cronologico, tipicamente 10. Animarlos a ~260 ms da el clip de evidencia.
`latency_ms` es lo que tardo la Etapa 2 de punta a punta.

---

## 3. Endpoints HTTP

| Metodo | Ruta | Devuelve |
|---|---|---|
| GET | `/api/state` | El mismo objeto que `state.state` |
| GET | `/api/domains` | `{ active, domains: [{ id, label, description, threshold, weights, taxonomy }] }` |
| POST | `/api/domain/{id}` | `{ active }`. Cambia de vertical en caliente, sin reiniciar |
| GET | `/api/events` | `{ events: [Event] }` |
| POST | `/api/events/{id}/feedback` | El `Event` actualizado |
| POST | `/api/pause` | El estado ya pausado. Suelta la camara y detiene la inferencia |
| POST | `/api/resume` | El estado ya reanudado. Reabre la camara |
| GET | `/video.mjpg` | Stream MJPEG anotado |
| GET | `/clips/{nombre}` | Un frame de evidencia |

### Feedback humano

```js
await fetch(`/api/events/${id}/feedback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ feedback: 'confirmed' }),   // o 'false_positive'
})
```

Actualiza `stats.precision`, que se recalcula solo sobre los eventos revisados.
Conviene aplicarlo optimista en la UI: el `event` por WebSocket llega despues.

### Video en vivo

```html
<img src="/video.mjpg" alt="camara" />
```

Un `<img>` normal. Lleva ya dibujados los esqueletos, las cajas, el score por
persona y las barras de senales. **No abrir mas de uno o dos a la vez**: cada
conexion es un stream abierto.

---

## 4. Cosas que muerden

- Antes de `status === "running"` el `<img>` del MJPEG da error: no lo montes
  hasta entonces, o se ve el icono de imagen rota. Lo mismo en `paused`.
- `pause` libera el dispositivo de camara, asi que `resume` puede tardar 1-2 s
  en reabrirlo. Si otra aplicacion se quedo la webcam mientras tanto, `resume`
  devuelve el estado con `error` puesto y `status` sigue en `paused`.
- Los `id` de track se reciclan. Un `#7` de hace un minuto no es la misma
  persona. Para agrupar en la UI usa `event.id`, nunca `track_id`.
- `signals` cambia de claves al cambiar de dominio. Itera el objeto, no leas
  campos fijos.
- `verdict` es `null` mientras `status` es `analyzing` y cuando es `error`.
  Comprueba antes de leer dentro.
- El stream MJPEG no se cierra solo al desmontar el componente: pon
  `img.src = ''` en el cleanup o dejas conexiones colgando.
