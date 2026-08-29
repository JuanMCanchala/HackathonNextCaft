import { Injectable, inject, signal } from '@angular/core';
import { VISION_BASE } from '../config/injection-tokens';

/**
 * Puente con el motor de vision que corre en local (FastAPI, puerto 8000).
 *
 * No pasa por Convex a proposito. Convex guarda los incidentes CONFIRMADOS,
 * que es lo que importa despues; esto es la sala de maquinas en vivo: el video
 * entrando, las senales del gate frame a frame y la llamada al verificador
 * ocurriendo. Para una demo hace falta ensenar las dos cosas, y la de arriba
 * solo existe mientras el motor esta corriendo.
 *
 * Si el motor no esta levantado, todo esto falla en silencio y la pagina lo
 * dice. El resto del panel sigue funcionando con los datos de Convex.
 */

export interface VisionTrack {
  id: number;
  score: number;
  signals: Record<string, number>;
}

export interface VisionCamera {
  id: string;
  label: string;
  source: string;
  fps: number;
  people: number;
  error: string | null;
  tracks: VisionTrack[];
}

export interface VisionState {
  status: string;
  fps: number;
  domain: string;
  domain_label: string;
  threshold: number;
  people: number;
  analyzing: number;
  offline: boolean;
  error: string | null;
  cameras: VisionCamera[];
  stats?: Record<string, number>;
}

export interface VisionVerdict {
  incident: boolean;
  incident_type: string;
  confidence: number;
  evidence: string;
}

export interface VisionEvent {
  id: string;
  domain: string;
  created_at: number;
  gate_score: number;
  signals: Record<string, number>;
  status: 'analyzing' | 'incident' | 'dismissed' | 'error';
  verdict: VisionVerdict | null;
  frames: string[];
  clip: string | null;
  camera: string;
  source: string;
}

export interface VisionJob {
  id: string;
  name: string;
  domain: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  frames: number;
  triggers: number;
  incidents: number;
  duration: number;
  elapsed: number;
  error: string | null;
}

export interface VisionDemo {
  id: string;
  domain: string;
  domain_label: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class VisionService {
  private readonly base = inject(VISION_BASE);

  readonly online = signal(false);

  /** URL del stream MJPEG. Se le anade un testigo para forzar reconexion. */
  streamUrl(testigo: number): string {
    return `${this.base}/video.mjpg?t=${testigo}`;
  }

  /** Los frames de evidencia los sirve el motor, no Convex. */
  frameUrl(nombre: string): string {
    return `${this.base}/clips/${nombre}`;
  }

  private async pedir<T>(ruta: string, init?: RequestInit): Promise<T | null> {
    try {
      const respuesta = await fetch(`${this.base}${ruta}`, {
        ...init,
        signal: AbortSignal.timeout(8000),
      });
      if (!respuesta.ok) {
        this.online.set(false);
        return null;
      }
      this.online.set(true);
      return (await respuesta.json()) as T;
    } catch {
      // Que el motor no este levantado es un estado normal, no un error a
      // gritar: el resto del panel vive de Convex y sigue funcionando.
      this.online.set(false);
      return null;
    }
  }

  state(): Promise<VisionState | null> {
    return this.pedir<VisionState>('/api/state');
  }

  events(): Promise<{ events: VisionEvent[] } | null> {
    return this.pedir<{ events: VisionEvent[] }>('/api/events');
  }

  jobs(): Promise<{ jobs: VisionJob[] } | null> {
    return this.pedir<{ jobs: VisionJob[] }>('/api/jobs');
  }

  demos(): Promise<{ demos: VisionDemo[] } | null> {
    return this.pedir<{ demos: VisionDemo[] }>('/api/demos');
  }

  /**
   * Sube un video y lo pasa por la misma cascada que el directo.
   *
   * No usa `pedir()` porque va como multipart y no como JSON, y porque aqui
   * el motivo del fallo importa: si el formato no vale o el fichero pesa
   * demasiado, quien lo sube tiene que saber por que.
   */
  async analizarVideo(archivo: File): Promise<{ ok: boolean; detalle: string }> {
    const cuerpo = new FormData();
    cuerpo.append('file', archivo);
    try {
      const respuesta = await fetch(`${this.base}/api/analyze`, {
        method: 'POST',
        body: cuerpo,
      });
      if (!respuesta.ok) {
        const datos = (await respuesta.json().catch(() => null)) as { detail?: string } | null;
        return { ok: false, detalle: datos?.detail ?? `Error ${respuesta.status}` };
      }
      return { ok: true, detalle: 'en cola' };
    } catch {
      return { ok: false, detalle: 'No se alcanza el motor de visión.' };
    }
  }

  runDemo(domain: string, name: string): Promise<unknown> {
    return this.pedir(`/api/demos/${domain}/${name}/run`, { method: 'POST' });
  }
}
