# Sentra Design System

Convenciones de UI para el frontend Angular. Base antes de instalar **Spartan/ui** (shadcn para Angular).

## Principios

1. **Dark-first** — tema oscuro SOC; light con `html[data-theme="light"]`.
2. **Tokens, no hex** — usar `--sentra-*` o clases semánticas (`bg-card`, `text-muted-foreground`).
3. **Rojo solo en critical** — no alarmar con rojo en estados normales (RNF-UX-2).
4. **Copy no acusatorio** — `shared/copy/labels.ts` + `categoryLabel()`.
5. **Standalone + OnPush** — todos los componentes UI.

## Capas de componentes

| Capa | Prefijo | Carpeta | Ejemplo |
|------|---------|---------|---------|
| Primitivo (Helm/Spartan) | `app-hlm-*` | `shared/ui/primitives/` | button, card, dialog |
| Patrón | `app-*` | `shared/ui/` | kpi-card, filter-bar |
| Dominio SOC | `app-*` | `shared/ui/` | status-badge, incident-card |
| Layout | `app-*` | `layout/` | shell, sidenav |

Catálogo completo: `src/app/shared/design/component-registry.ts`.

## Tokens CSS

Definidos en `src/styles.css`:

- **Sentra:** `--sentra-bg-*`, `--sentra-text-*`, `--sentra-signal-cyan`, severidades.
- **Spartan bridge:** `--background`, `--primary`, `--border`, `--radius`, etc.

TypeScript: `src/app/shared/design/tokens.ts`.

## Utilidades de clase

| Clase | Uso |
|-------|-----|
| `sentra-panel` | Card / sección con borde y sombra |
| `sentra-panel-elevated` | Panel secundario |
| `sentra-btn` + variantes | Botones hasta migrar a Helm |
| `sentra-input` | Inputs de formulario |
| `sentra-badge` | Base de badges |

Componer clases: `cn()` desde `shared/design/cn.ts`.

## Tipografía

| Rol | Clase / token |
|-----|----------------|
| Título página | `font-display text-2xl font-semibold` |
| Sección | `text-sm uppercase tracking-wider text-muted-foreground` |
| Cuerpo | `text-sm text-foreground` |
| Mono / IDs | `font-mono text-[10px]` |

## Clerk (auth)

Config en `src/environments/environment.ts` → `clerk`:

- `publishableKey` — `pk_test_...` (frontend)
- `jwtIssuerDomain` — `https://premium-humpback-2836.clerk.accounts.dev` (Convex)

`useMockAuth: true` hasta cablear `ClerkAuthService`. La key ya está guardada.

## Primitivos Helm (implementados)

Spartan oficial requiere **Angular 21+**. En Angular 20 usamos primitivos propios en `shared/ui/primitives/` (misma filosofía shadcn):

| Directiva / componente | Uso |
|------------------------|-----|
| `hlmBtn` | `button hlmBtn variant="outline"` |
| `hlmBadge` | `span hlmBadge variant="success"` |
| `hlm-card` + header/title/content | Tarjetas KPI, estados |
| `hlmInput` | inputs y textareas |

Cuando migren a Angular 21, se puede sustituir por `@spartan-ng/cli` sin cambiar tokens CSS.

## Próximo paso (opcional)

Al actualizar a Angular 21:

```bash
npm i @spartan-ng/brain
ng g @spartan-ng/cli:init
```
