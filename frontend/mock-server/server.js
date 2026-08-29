const path = require('path');
const jsonServer = require('json-server');
const { paginate, apiError, toSummary, parseMulti } = require('./pagination');

const PORT = process.env.PORT || 3000;
const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const db = router.db;

const idempotencyStore = new Map();

server.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
server.use(jsonServer.bodyParser);

function nowIso() {
  return new Date().toISOString();
}

function findIncident(id) {
  return db.get('incidents').find({ id }).value();
}

function writeIncident(incident) {
  db.get('incidents').find({ id: incident.id }).assign(incident).write();
  return incident;
}

function nextTimelineId(incidentId) {
  return `tl_${incidentId}_${Date.now()}`;
}

function computeStats(workspaceId, from, to) {
  const incidents = db
    .get('incidents')
    .filter((i) => i.workspaceId === workspaceId)
    .filter((i) => i.openedAt >= from && i.openedAt <= to)
    .value();

  const cameras = db.get('cameras').filter((c) => c.workspaceId === workspaceId).value();
  const detections = db
    .get('detections')
    .filter((d) => d.workspaceId === workspaceId)
    .filter((d) => d.occurredAt >= from && d.occurredAt <= to)
    .value();

  const incidentsByState = {
    detected: 0,
    triaged: 0,
    acknowledged: 0,
    resolved: 0,
    dismissed: 0,
  };
  const incidentsBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const inc of incidents) {
    incidentsByState[inc.state] = (incidentsByState[inc.state] || 0) + 1;
    incidentsBySeverity[inc.severity] = (incidentsBySeverity[inc.severity] || 0) + 1;
  }

  const workspace = db.get('workspaces').find({ id: workspaceId }).value();

  return {
    workspaceId,
    from,
    to,
    timezone: workspace?.settings?.timezone ?? 'UTC',
    counts: {
      incidentsByState,
      incidentsBySeverity,
      detectionsTotal: detections.length,
      camerasOnline: cameras.filter((c) => c.connectivity === 'online').length,
      camerasTotal: cameras.length,
    },
  };
}

function checkIdempotency(req, res) {
  const key = req.get('Idempotency-Key');
  if (!key) return null;
  const stored = idempotencyStore.get(key);
  if (stored) {
    if (stored.bodyHash !== JSON.stringify(req.body)) {
      apiError(res, 409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload');
      return 'conflict';
    }
    res.status(stored.status).json(stored.body);
    return 'handled';
  }
  return key;
}

function storeIdempotency(key, status, body, bodyHash) {
  if (key) idempotencyStore.set(key, { status, body, bodyHash });
}

// --- Workspaces ---
server.get('/v1/workspaces', (req, res) => {
  const items = db.get('workspaces').value().map(({ settings, ...summary }) => summary);
  res.json(paginate(items, { cursor: req.query.cursor, limit: req.query.limit }));
});

server.get('/v1/workspaces/:workspaceId', (req, res) => {
  const ws = db.get('workspaces').find({ id: req.params.workspaceId }).value();
  if (!ws) return apiError(res, 404, 'NOT_FOUND', 'Workspace no encontrado');
  res.json(ws);
});

// --- Cameras ---
server.get('/v1/cameras', (req, res) => {
  const { workspaceId, adminStatus, connectivity, cursor, limit } = req.query;
  if (!workspaceId) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'workspaceId es requerido', 'req_cam_list');
  }

  let cameras = db.get('cameras').filter({ workspaceId }).value();
  if (adminStatus) cameras = cameras.filter((c) => c.adminStatus === adminStatus);
  if (connectivity) cameras = cameras.filter((c) => c.connectivity === connectivity);

  res.json(paginate(cameras, { cursor, limit, sortFn: (a, b) => a.label.localeCompare(b.label) }));
});

server.get('/v1/cameras/:cameraId', (req, res) => {
  const camera = db.get('cameras').find({ id: req.params.cameraId }).value();
  if (!camera) return apiError(res, 404, 'NOT_FOUND', 'Cámara no encontrada');
  res.json(camera);
});

// --- Incidents ---
server.get('/v1/incidents', (req, res) => {
  const { workspaceId, cameraId, category, from, to, cursor, limit } = req.query;
  if (!workspaceId) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'workspaceId es requerido', 'req_inc_list');
  }

  const states = parseMulti(req.query.state);
  const severities = parseMulti(req.query.severity);

  let incidents = db.get('incidents').filter({ workspaceId }).value();
  if (cameraId) incidents = incidents.filter((i) => i.cameraId === cameraId);
  if (category) incidents = incidents.filter((i) => i.category === category);
  if (states.length) incidents = incidents.filter((i) => states.includes(i.state));
  if (severities.length) incidents = incidents.filter((i) => severities.includes(i.severity));
  if (from) incidents = incidents.filter((i) => i.openedAt >= from);
  if (to) incidents = incidents.filter((i) => i.openedAt <= to);

  incidents.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const summaries = incidents.map(toSummary);
  res.json(paginate(summaries, { cursor, limit }));
});

server.get('/v1/incidents/:incidentId', (req, res) => {
  const incident = findIncident(req.params.incidentId);
  if (!incident) return apiError(res, 404, 'NOT_FOUND', 'Incidente no encontrado');
  res.json(incident);
});

function transitionIncident(req, res, targetState, opts = {}) {
  const idempotency = checkIdempotency(req, res);
  if (idempotency === 'conflict' || idempotency === 'handled') return;

  const incident = findIncident(req.params.incidentId);
  if (!incident) return apiError(res, 404, 'NOT_FOUND', 'Incidente no encontrado');

  const { expectedVersion, reason } = req.body ?? {};
  if (expectedVersion !== incident.version) {
    return apiError(res, 409, 'CONFLICT', 'Versión obsoleta del incidente');
  }

  if (opts.requireReason && (!reason || !String(reason).trim())) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'reason es requerido');
  }

  const fromState = incident.state;
  const allowed = {
    detected: { triage: 'triaged', dismiss: 'dismissed' },
    triaged: { acknowledge: 'acknowledged', dismiss: 'dismissed' },
    acknowledged: { resolve: 'resolved', dismiss: 'dismissed' },
  };

  const next = allowed[fromState]?.[opts.command];
  if (!next || next !== targetState) {
    return apiError(res, 409, 'CONFLICT', `Transición inválida desde ${fromState}`);
  }

  const updated = {
    ...incident,
    state: targetState,
    version: incident.version + 1,
    lastObservedAt: nowIso(),
    category: req.body?.category ?? incident.category,
    assignedToSubjectId:
      req.body?.assignedToSubjectId !== undefined
        ? req.body.assignedToSubjectId
        : incident.assignedToSubjectId,
    timeline: [
      ...incident.timeline,
      {
        id: nextTimelineId(incident.id),
        at: nowIso(),
        type: 'state_changed',
        actorKind: 'user',
        actorId: 'user_operator_demo',
        from: fromState,
        to: targetState,
        message: reason ?? req.body?.notes ?? null,
      },
    ],
  };

  writeIncident(updated);
  storeIdempotency(idempotency, 200, updated, JSON.stringify(req.body));
  res.json(updated);
}

server.post('/v1/incidents/:incidentId/triage', (req, res) =>
  transitionIncident(req, res, 'triaged', { command: 'triage' }),
);
server.post('/v1/incidents/:incidentId/acknowledge', (req, res) =>
  transitionIncident(req, res, 'acknowledged', { command: 'acknowledge' }),
);
server.post('/v1/incidents/:incidentId/resolve', (req, res) =>
  transitionIncident(req, res, 'resolved', { command: 'resolve' }),
);
server.post('/v1/incidents/:incidentId/dismiss', (req, res) =>
  transitionIncident(req, res, 'dismissed', { command: 'dismiss', requireReason: true }),
);

server.patch('/v1/incidents/:incidentId', (req, res) => {
  const idempotency = checkIdempotency(req, res);
  if (idempotency === 'conflict' || idempotency === 'handled') return;

  const incident = findIncident(req.params.incidentId);
  if (!incident) return apiError(res, 404, 'NOT_FOUND', 'Incidente no encontrado');

  const { severity, reason, expectedVersion } = req.body ?? {};
  if (expectedVersion !== incident.version) {
    return apiError(res, 409, 'CONFLICT', 'Versión obsoleta del incidente');
  }

  if (!severity || severity === incident.severity) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'severity debe cambiar');
  }
  if (!reason || !String(reason).trim()) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'reason es requerido al cambiar severidad');
  }

  const updated = {
    ...incident,
    severity,
    version: incident.version + 1,
    lastObservedAt: nowIso(),
    severityOverride: {
      from: incident.severity,
      to: severity,
      reason,
      actorSubjectId: 'user_operator_demo',
      at: nowIso(),
    },
    timeline: [
      ...incident.timeline,
      {
        id: nextTimelineId(incident.id),
        at: nowIso(),
        type: 'severity_changed',
        actorKind: 'user',
        actorId: 'user_operator_demo',
        from: incident.severity,
        to: severity,
        message: reason,
      },
    ],
  };

  writeIncident(updated);
  storeIdempotency(idempotency, 200, updated, JSON.stringify(req.body));
  res.json(updated);
});

server.get('/v1/incidents/:incidentId/detections', (req, res) => {
  const incident = findIncident(req.params.incidentId);
  if (!incident) return apiError(res, 404, 'NOT_FOUND', 'Incidente no encontrado');

  const detections = db
    .get('detections')
    .filter((d) => incident.detectionIds.includes(d.id))
    .value()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  res.json(paginate(detections, { cursor: req.query.cursor, limit: req.query.limit }));
});

server.get('/v1/incidents/:incidentId/evidence', (req, res) => {
  const incident = findIncident(req.params.incidentId);
  if (!incident) return apiError(res, 404, 'NOT_FOUND', 'Incidente no encontrado');

  const evidence = db
    .get('evidence')
    .filter((e) => incident.evidenceIds.includes(e.id))
    .value()
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

  res.json(paginate(evidence, { cursor: req.query.cursor, limit: req.query.limit }));
});

// --- Evidence access ---
server.post('/v1/evidence/:evidenceId/access', (req, res) => {
  const idempotency = checkIdempotency(req, res);
  if (idempotency === 'conflict' || idempotency === 'handled') return;

  const evidence = db.get('evidence').find({ id: req.params.evidenceId }).value();
  if (!evidence) return apiError(res, 404, 'NOT_FOUND', 'Evidencia no encontrada');

  if (evidence.status === 'unavailable' || evidence.status === 'failed') {
    return apiError(res, 503, 'EVIDENCE_UNAVAILABLE', 'Evidencia no disponible');
  }
  if (evidence.status === 'expired') {
    return apiError(res, 503, 'EVIDENCE_UNAVAILABLE', 'Evidencia expirada');
  }

  const ttl = Math.min(300, Math.max(60, req.body?.ttlSeconds ?? 120));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const grant = {
    evidenceId: evidence.id,
    url: `https://mock.sentra.local/evidence/${evidence.id}?token=mock_${Date.now()}`,
    expiresAt,
    purpose: req.body?.purpose ?? 'incident-detail',
  };

  storeIdempotency(idempotency, 200, grant, JSON.stringify(req.body));
  res.json(grant);
});

// --- Stats ---
server.get('/v1/stats', (req, res) => {
  const { workspaceId, from, to } = req.query;
  if (!workspaceId || !from || !to) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'workspaceId, from y to son requeridos');
  }

  const ws = db.get('workspaces').find({ id: workspaceId }).value();
  if (!ws) return apiError(res, 404, 'NOT_FOUND', 'Workspace no encontrado');

  res.json(computeStats(workspaceId, from, to));
});

server.listen(PORT, () => {
  console.log(`Sentra mock API listening on http://localhost:${PORT}/v1`);
});
