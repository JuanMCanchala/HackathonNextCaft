import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Eye, HardHat, Layers,
  Pause, PersonStanding, Play, Radio, ShieldCheck, ShoppingBag, Swords, ThumbsDown,
  ThumbsUp, Users, VideoOff, Zap,
} from 'lucide-react'

const DOMAIN_ICONS = {
  retail_theft: ShoppingBag,
  violence: Swords,
  industrial_safety: HardHat,
  fall_detection: PersonStanding,
}

const STATUS_LABEL = {
  analyzing: 'analizando',
  incident: 'incidente',
  dismissed: 'descartado',
  error: 'error',
}

function useLiveFeed() {
  const [snapshot, setSnapshot] = useState(null)
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const retry = useRef(null)

  useEffect(() => {
    let ws
    let closed = false

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)

      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry.current = setTimeout(connect, 1200)
      }
      ws.onmessage = (raw) => {
        const msg = JSON.parse(raw.data)
        if (msg.type === 'state') setSnapshot(msg.state)
        if (msg.type === 'bootstrap') setEvents(msg.events)
        if (msg.type === 'event') {
          setEvents((prev) => {
            const rest = prev.filter((e) => e.id !== msg.event.id)
            return [msg.event, ...rest].slice(0, 60)
          })
        }
      }
    }

    connect()
    return () => {
      closed = true
      clearTimeout(retry.current)
      ws?.close()
    }
  }, [])

  return { snapshot, events, connected, setEvents }
}

function Metric({ label, value, tone }) {
  return (
    <div className={`metric ${tone || ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function SignalChips({ signals }) {
  const entries = Object.entries(signals || {}).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null
  return (
    <div className="signals">
      {entries.map(([name, value]) => (
        <span key={name} className={`sig ${value >= 0.5 ? 'hi' : ''}`}>
          <i />
          {name} {value.toFixed(2)}
        </span>
      ))}
    </div>
  )
}

function EvidencePlayer({ frames }) {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!playing || !frames?.length) return undefined
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), 260)
    return () => clearInterval(id)
  }, [playing, frames])

  if (!frames?.length) return null

  return (
    <div className="evidence-player">
      {/* Todos los frames montados: precargados, sin parpadeo al avanzar. */}
      {frames.map((name, n) => (
        <img
          key={name}
          src={`/clips/${name}`}
          alt={`evidencia ${n + 1}`}
          style={{ opacity: n === i ? 1 : 0 }}
        />
      ))}
      <div className="scrub">
        <button onClick={() => setPlaying((p) => !p)} title={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={i}
          onChange={(e) => { setPlaying(false); setI(Number(e.target.value)) }}
        />
        <span>{i + 1}/{frames.length}</span>
      </div>
    </div>
  )
}

function IncidentCard({ event, onFeedback }) {
  const verdict = event.verdict
  const when = new Date(event.created_at * 1000).toLocaleTimeString('es-ES')

  return (
    <article className={`card ${event.status}`}>
      <div className="card-head">
        <div>
          <div className="card-title">
            {event.status === 'analyzing'
              ? 'Verificando sospecha'
              : verdict?.incident_type || 'Sin veredicto'}
          </div>
          <div className="card-sub">
            {when} · persona #{event.track_id} · gate {event.gate_score.toFixed(2)}
            {event.latency_ms ? ` · ${(event.latency_ms / 1000).toFixed(1)}s` : ''}
          </div>
        </div>
        <span className="card-status">{STATUS_LABEL[event.status]}</span>
      </div>

      {event.status === 'analyzing' && (
        <div className="evidence" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="spinner" />
          El filtro geometrico disparo. El VLM esta revisando el clip.
        </div>
      )}

      <EvidencePlayer frames={event.frames} />

      {verdict && (
        <>
          <div className="evidence">
            {verdict.evidence}
            {verdict.incident && verdict.recommended_action && (
              <div className="action">
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{verdict.recommended_action}</span>
              </div>
            )}
          </div>
          <div className="conf">
            <span className="lbl">confianza</span>
            <span className="track">
              <span className="fill" style={{ width: `${verdict.confidence * 100}%` }} />
            </span>
            <span className="num">{Math.round(verdict.confidence * 100)}%</span>
          </div>
        </>
      )}

      {event.status === 'error' && (
        <div className="evidence">No se pudo completar el analisis de este clip.</div>
      )}

      <SignalChips signals={event.signals} />

      {event.status !== 'analyzing' && (
        event.feedback ? (
          <div className="feedback-done">
            <CheckCircle2 size={13} />
            {event.feedback === 'confirmed'
              ? 'Marcado como incidente real'
              : 'Marcado como falso positivo'}
          </div>
        ) : (
          <div className="actions">
            <button
              className={event.feedback === 'confirmed' ? 'on-yes' : ''}
              onClick={() => onFeedback(event.id, 'confirmed')}
            >
              <ThumbsUp size={13} /> Es real
            </button>
            <button
              className={event.feedback === 'false_positive' ? 'on-no' : ''}
              onClick={() => onFeedback(event.id, 'false_positive')}
            >
              <ThumbsDown size={13} /> Falso positivo
            </button>
          </div>
        )
      )}
    </article>
  )
}

export default function App() {
  const { snapshot, events, connected, setEvents } = useLiveFeed()
  const [domains, setDomains] = useState([])

  useEffect(() => {
    fetch('/api/domains')
      .then((r) => r.json())
      .then((d) => setDomains(d.domains))
      .catch(() => {})
  }, [])

  const switchDomain = useCallback((id) => {
    fetch(`/api/domain/${id}`, { method: 'POST' }).catch(() => {})
  }, [])

  const sendFeedback = useCallback((id, feedback) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, feedback } : e)))
    fetch(`/api/events/${id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    }).catch(() => {})
  }, [setEvents])

  const stats = snapshot?.stats || {}
  const running = snapshot?.status === 'running'
  const incidents = useMemo(
    () => events.filter((e) => e.status === 'incident').length,
    [events],
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark"><ShieldCheck size={16} /></span>
          Sentinel
          <small>vigilancia zero-shot</small>
        </div>

        <span className="pill">
          <span className={`dot ${!connected ? 'down' : snapshot?.analyzing ? 'busy' : running ? 'live' : ''}`} />
          {!connected
            ? 'sin conexion'
            : snapshot?.analyzing
              ? `${snapshot.analyzing} en analisis`
              : running ? 'operando' : (snapshot?.status || 'iniciando')}
        </span>

        {snapshot?.offline && (
          <span className="pill" style={{ color: 'var(--warn)' }}>
            <Zap size={11} /> modo offline
          </span>
        )}

        <div className="metrics">
          <Metric label="fps" value={snapshot?.fps ?? '—'} />
          <Metric label="personas" value={snapshot?.people ?? 0} />
          <Metric label="disparos" value={stats.triggers ?? 0} />
          <Metric label="incidentes" value={incidents} tone="hot" />
          <Metric label="filtrados" value={stats.dismissed_by_vlm ?? 0} tone="good" />
          <Metric
            label="precision"
            value={stats.precision != null ? `${Math.round(stats.precision * 100)}%` : '—'}
            tone="good"
          />
        </div>
      </header>

      {snapshot?.error && (
        <div className="banner" style={{ marginTop: 12 }}>
          <AlertTriangle size={14} /> {snapshot.error}
        </div>
      )}

      <div className="main">
        <section className="stage">
          <div className="viewport">
            {running ? (
              <>
                <img src="/video.mjpg" alt="camara en vivo" />
                <span className="badge-live">
                  <span className="dot live" /> EN VIVO
                </span>
              </>
            ) : (
              <div className="placeholder">
                <VideoOff size={26} />
                {connected ? 'Iniciando camara y cargando el modelo de pose…' : 'Backend no disponible'}
              </div>
            )}
          </div>

          <div className="domains">
            {domains.map((d) => {
              const Icon = DOMAIN_ICONS[d.id] || Layers
              const active = snapshot?.domain === d.id
              return (
                <button
                  key={d.id}
                  className={`domain ${active ? 'active' : ''}`}
                  onClick={() => switchDomain(d.id)}
                >
                  <div className="head">
                    <Icon size={15} />
                    {d.label}
                  </div>
                  <p>{d.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="feed">
          <div className="feed-head">
            <Radio size={14} />
            Incidentes
            <span className="count">{events.length} eventos</span>
          </div>
          <div className="feed-body">
            {events.length === 0 ? (
              <div className="feed-empty">
                <div className="icon"><Eye size={30} /></div>
                Vigilando. Ningun disparo todavia.
                <br />
                El filtro geometrico corre en cada frame; el VLM solo se
                invoca cuando hay sospecha real.
              </div>
            ) : (
              events.map((event) => (
                <IncidentCard key={event.id} event={event} onFeedback={sendFeedback} />
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
