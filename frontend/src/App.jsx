import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Eye, HardHat, Layers,
  Clock3, FileVideo, MessageSquare, Pause, PersonStanding, Play, Power, Radio,
  Cctv,
  Send, ShieldCheck, ShoppingBag, Swords, ThumbsDown, Upload,
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
  const [jobs, setJobs] = useState([])
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
        if (msg.type === 'bootstrap') {
          setEvents(msg.events)
          setJobs(msg.jobs || [])
        }
        if (msg.type === 'job') {
          setJobs((prev) => {
            const rest = prev.filter((j) => j.id !== msg.job.id)
            return [msg.job, ...rest].slice(0, 12)
          })
        }
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

  return { snapshot, events, jobs, connected, setEvents }
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

function CameraGrid({ cameras, running, paused, connected }) {
  if (!running) {
    return (
      <div className="viewport">
        <div className="placeholder">
          <VideoOff size={26} />
          {!connected
            ? 'Backend no disponible'
            : paused
              ? 'En pausa. Las camaras estan liberadas y no se procesa nada.'
              : 'Abriendo camaras y cargando el modelo de pose…'}
        </div>
      </div>
    )
  }

  const list = cameras.length ? cameras : [{ id: null, label: 'camara', fps: 0, people: 0 }]

  return (
    <div className={`grid-cams n${Math.min(list.length, 4)}`}>
      {list.map((cam) => (
        <div className="viewport" key={cam.id || 'default'}>
          {cam.error ? (
            <div className="placeholder">
              <VideoOff size={22} />
              {cam.label}: {cam.error}
            </div>
          ) : (
            <img
              src={`/video.mjpg${cam.id ? `?camera=${encodeURIComponent(cam.id)}` : ''}`}
              alt={cam.label}
            />
          )}
          <span className="badge-live">
            <span className="dot live" /> {cam.label}
          </span>
          {list.length > 1 && (
            <span className="badge-stats">
              {cam.fps} FPS · {cam.people} pers.
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function Uploader({ jobs }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const active = jobs.find((j) => j.status === 'running' || j.status === 'queued')

  const send = async (file) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch('/api/analyze', { method: 'POST', body })
      if (!res.ok) setError((await res.json().catch(() => ({}))).detail || 'Fallo la subida')
    } catch {
      setError('No se pudo contactar con el backend')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="uploader">
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/x-msvideo,video/quicktime,video/x-matroska,video/webm"
        hidden
        onChange={(e) => send(e.target.files?.[0])}
      />
      <button
        className="upload-btn"
        onClick={() => input.current?.click()}
        disabled={busy || !!active}
      >
        <Upload size={14} />
        {busy ? 'Subiendo…' : active ? 'Analizando…' : 'Analizar un video'}
      </button>

      {error && <div className="upload-error">{error}</div>}

      {jobs.slice(0, 3).map((job) => (
        <div key={job.id} className={`job ${job.status}`}>
          <div className="job-head">
            <FileVideo size={12} />
            <span className="job-name">{job.name}</span>
            <span className="job-meta">
              {job.status === 'done'
                ? `${job.incidents} incid. / ${job.triggers} disparos`
                : job.status === 'error' ? 'error' : `${Math.round(job.progress * 100)}%`}
            </span>
          </div>
          {job.status !== 'done' && job.status !== 'error' && (
            <div className="job-bar"><span style={{ width: `${job.progress * 100}%` }} /></div>
          )}
          {job.error && <div className="upload-error">{job.error}</div>}
        </div>
      ))}
    </div>
  )
}

function Timeline({ moments }) {
  const [open, setOpen] = useState(false)
  if (!moments?.length) return null

  return (
    <div className="timeline">
      <button className="section-toggle" onClick={() => setOpen((v) => !v)}>
        <Clock3 size={12} />
        Cronologia
        <span className="hint">{open ? 'ocultar' : `${moments.length} momentos`}</span>
      </button>
      {open && (
        <ol>
          {moments.map((m, i) => (
            <li key={i} className={m.trigger ? 'fire' : ''}>
              <span className="tl-t">{m.t > 0 ? `+${m.t.toFixed(1)}` : m.t.toFixed(1)}s</span>
              <span className="tl-note">{m.note}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Chat({ eventId }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const ask = async () => {
    const question = text.trim()
    if (!question || busy) return
    setBusy(true)
    setText('')
    setHistory((h) => [...h, { question, answer: null }])
    try {
      const res = await fetch(`/api/events/${eventId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      setHistory(data.history || [])
    } catch {
      setHistory((h) => h.map((t, i) =>
        i === h.length - 1 ? { ...t, answer: 'No se pudo contactar con el backend.' } : t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat">
      <button className="section-toggle" onClick={() => setOpen((v) => !v)}>
        <MessageSquare size={12} />
        Preguntar sobre este incidente
        {history.length > 0 && <span className="hint">{history.length}</span>}
      </button>

      {open && (
        <>
          {history.map((turn, i) => (
            <div key={i} className="turn">
              <div className="q">{turn.question}</div>
              <div className="a">
                {turn.answer ?? <span className="spinner" />}
              </div>
            </div>
          ))}
          <div className="ask">
            <input
              value={text}
              placeholder="¿Llevaba mochila? ¿Que hago ahora?"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
              disabled={busy}
            />
            <button onClick={ask} disabled={busy || !text.trim()}>
              <Send size={12} />
            </button>
          </div>
        </>
      )}
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
            {when} · {event.camera || 'cam1'} · persona #{event.track_id} · gate {event.gate_score.toFixed(2)}
            {event.latency_ms ? ` · ${(event.latency_ms / 1000).toFixed(1)}s` : ''}
            {event.source && event.source !== 'live' && (
              <div className="card-origin">
                <FileVideo size={10} /> {event.source}
                {event.offset != null && ` · min ${Math.floor(event.offset / 60)}:${String(Math.floor(event.offset % 60)).padStart(2, '0')}`}
              </div>
            )}
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

      <Timeline moments={event.timeline} />
      {event.status !== 'analyzing' && <Chat eventId={event.id} />}

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
  const { snapshot, events, jobs, connected, setEvents } = useLiveFeed()
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

  const togglePower = useCallback(() => {
    const next = snapshot?.status === 'paused' ? 'resume' : 'pause'
    fetch(`/api/${next}`, { method: 'POST' }).catch(() => {})
  }, [snapshot?.status])

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
  const paused = snapshot?.status === 'paused'
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
          <span className={`dot ${!connected || paused ? 'down' : snapshot?.analyzing ? 'busy' : running ? 'live' : ''}`} />
          {!connected
            ? 'sin conexion'
            : paused
              ? 'en pausa'
              : snapshot?.analyzing
                ? `${snapshot.analyzing} en analisis`
                : running ? 'operando' : (snapshot?.status || 'iniciando')}
        </span>

        {snapshot?.offline && (
          <span className="pill" style={{ color: 'var(--warn)' }}>
            <Zap size={11} /> modo offline
          </span>
        )}

        <button
          className={`power ${paused ? 'off' : ''}`}
          onClick={togglePower}
          disabled={!connected}
          title={paused ? 'Reanudar: vuelve a abrir la camara' : 'Pausar: suelta la camara y detiene la inferencia'}
        >
          <Power size={13} />
          {paused ? 'Reanudar' : 'Pausar'}
        </button>

        <div className="metrics">
          <Metric label="fps" value={snapshot?.fps ?? '—'} />
          <Metric label="camaras" value={snapshot?.cameras?.length ?? 1} />
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
          <CameraGrid
            cameras={snapshot?.cameras || []}
            running={running}
            paused={paused}
            connected={connected}
          />

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

          <Uploader jobs={jobs} />
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
