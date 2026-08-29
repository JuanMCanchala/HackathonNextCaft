/**
 * Catálogo de componentes UI — qué usar y dónde.
 * Convención de nombres antes/durante migración a Spartan Helm.
 */

export type ComponentLayer = 'primitive' | 'pattern' | 'domain' | 'layout';

export interface ComponentSpec {
  selector: string;
  layer: ComponentLayer;
  purpose: string;
  /** Ruta del archivo (referencia para devs). */
  path: string;
  /** Sustituto Spartan planificado, si aplica. */
  spartanTarget?: string;
}

/** Primitivos — estilo shadcn/Helm (copiar a `shared/ui/primitives/`). */
export const primitives: ComponentSpec[] = [
  { selector: 'app-hlm-button', layer: 'primitive', purpose: 'Acciones primarias/secundarias', path: 'shared/ui/primitives/button', spartanTarget: 'button' },
  { selector: 'app-hlm-badge', layer: 'primitive', purpose: 'Etiquetas compactas', path: 'shared/ui/primitives/badge', spartanTarget: 'badge' },
  { selector: 'app-hlm-card', layer: 'primitive', purpose: 'Contenedor con borde y padding', path: 'shared/ui/primitives/card', spartanTarget: 'card' },
  { selector: 'app-hlm-input', layer: 'primitive', purpose: 'Campos de texto', path: 'shared/ui/primitives/input', spartanTarget: 'input' },
  { selector: 'app-hlm-select', layer: 'primitive', purpose: 'Selección única', path: 'shared/ui/primitives/select', spartanTarget: 'select' },
  { selector: 'app-hlm-dialog', layer: 'primitive', purpose: 'Modales confirmación', path: 'shared/ui/primitives/dialog', spartanTarget: 'dialog' },
  { selector: 'app-hlm-table', layer: 'primitive', purpose: 'Tablas accesibles', path: 'shared/ui/primitives/table', spartanTarget: 'table' },
  { selector: 'app-hlm-tabs', layer: 'primitive', purpose: 'Navegación por pestañas', path: 'shared/ui/primitives/tabs', spartanTarget: 'tabs' },
  { selector: 'app-hlm-skeleton', layer: 'primitive', purpose: 'Loading placeholder', path: 'shared/ui/primitives/skeleton', spartanTarget: 'skeleton' },
];

/** Patrones — composición reutilizable sin lógica de dominio. */
export const patterns: ComponentSpec[] = [
  { selector: 'app-kpi-card', layer: 'pattern', purpose: 'Métrica + label + hint', path: 'shared/ui/kpi-card.component.ts' },
  { selector: 'app-filter-bar', layer: 'pattern', purpose: 'Filtros de listado', path: 'shared/ui/filter-bar.component.ts' },
  { selector: 'app-cursor-table', layer: 'pattern', purpose: 'Tabla paginada por cursor', path: 'shared/ui/cursor-table.component.ts', spartanTarget: 'table' },
  { selector: 'app-empty-state', layer: 'pattern', purpose: 'Lista vacía', path: 'shared/ui/empty-state.component.ts' },
  { selector: 'app-error-state', layer: 'pattern', purpose: 'Error + reintentar', path: 'shared/ui/error-state.component.ts' },
  { selector: 'app-loading-state', layer: 'pattern', purpose: 'Carga inicial', path: 'shared/ui/loading-state.component.ts' },
  { selector: 'app-timeline-view', layer: 'pattern', purpose: 'Timeline de incidente', path: 'shared/ui/timeline-view.component.ts' },
  { selector: 'app-toast-host', layer: 'pattern', purpose: 'Notificaciones globales', path: 'shared/ui/toast-host.component.ts', spartanTarget: 'sonner' },
];

/** Dominio — vocabulario SOC / API contract. */
export const domain: ComponentSpec[] = [
  { selector: 'app-status-badge', layer: 'domain', purpose: 'Estado incidente o conectividad cámara', path: 'shared/ui/status-badge.component.ts', spartanTarget: 'badge' },
  { selector: 'app-severity-badge', layer: 'domain', purpose: 'Severidad operacional', path: 'shared/ui/severity-badge.component.ts', spartanTarget: 'badge' },
  { selector: 'app-category-label', layer: 'domain', purpose: 'Categoría no acusatoria (RNF-COPY)', path: 'shared/ui/category-label.component.ts' },
  { selector: 'app-confidence-indicator', layer: 'domain', purpose: 'Barra confianza 0–1', path: 'shared/ui/confidence-indicator.component.ts' },
  { selector: 'app-incident-card', layer: 'domain', purpose: 'Tarjeta resumen incidente', path: 'shared/ui/incident-card.component.ts', spartanTarget: 'card' },
  { selector: 'app-camera-card', layer: 'domain', purpose: 'Tarjeta cámara en grid', path: 'shared/ui/camera-card.component.ts', spartanTarget: 'card' },
  { selector: 'app-evidence-viewer', layer: 'domain', purpose: 'Acceso evidencia efímera', path: 'features/detections/evidence-viewer.component.ts' },
];

/** Layout — shell de aplicación. */
export const layoutComponents: ComponentSpec[] = [
  { selector: 'app-shell', layer: 'layout', purpose: 'Layout principal', path: 'layout/shell.component.ts' },
  { selector: 'app-sidenav', layer: 'layout', purpose: 'Navegación lateral', path: 'layout/sidenav.component.ts', spartanTarget: 'sidebar' },
  { selector: 'app-topbar', layer: 'layout', purpose: 'Barra superior + workspace', path: 'layout/topbar.component.ts' },
];

export const allComponents = [...primitives, ...patterns, ...domain, ...layoutComponents];
