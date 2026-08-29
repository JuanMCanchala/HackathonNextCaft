# Integracion entre los dos backends

Hay dos backends en este repo y **no se solapan**. Conviene tenerlo claro antes
de tocar nada, porque a primera vista parecen competir.

| | `backend/` (Python) | `convex-backend/` (TypeScript) |
|---|---|---|
| Hace | vision, cascada de 3 etapas, veredicto del VLM | multi-tenant, persistencia, ciclo de vida del incidente, autorizacion, auditoria |
| Corre | en la maquina que tiene las camaras | en Convex |
| Estado | efimero: buffer de 12 s en RAM | duradero: registro de la verdad |

El de Python decide **si hay incidente**. El de Convex decide **quien puede
verlo, como se agrupa, quien lo atiende y que paso despues**.

---

## El punto de union

`detections.intake` de Convex, alimentado por `backend/core/intake.py`.

Solo viajan los incidentes que la **Etapa 2 confirma**. Los disparos que el VLM
descarta se quedan aqui: la base de datos de Convex es el registro de lo que
merece atencion, no el de cada sospecha que levanta el filtro geometrico.

Se manda el id del evento como `sourceEventId`, asi que un reintento cae en la
idempotencia de Convex en vez de duplicar el incidente.

### Configuracion

```
CONVEX_INTAKE_URL=https://<deployment>.convex.site/intake
CONVEX_INTAKE_TOKEN=<token del servicio interno>
CONVEX_WORKSPACE_ID=<id del workspace>
CONVEX_CAMERA_IDS={"Entrada":"j57abc...","Almacen":"j57def..."}
PUBLIC_BASE_URL=https://<tunel-o-despliegue>
```

Sin `CONVEX_INTAKE_URL` ni `CONVEX_WORKSPACE_ID` el puente queda inactivo y el
pipeline funciona exactamente igual que antes.

`PUBLIC_BASE_URL` importa: sin ella los `evidenceRefs` van vacios, porque un
`http://localhost:8000/clips/...` no es alcanzable desde Convex.

---

## La taxonomia, ya alineada

Convex aceptaba tres categorias y el pipeline produce veinte tipos en cuatro
dominios, asi que robo, agresion y falta de EPP no tenian donde ir: un robo
confirmado por el VLM no llegaba a registrarse en ningun sitio. Ya esta
resuelto.

`convex/lib/domain/normalize.ts` cubre ahora las cuatro verticales:

```ts
export const CATEGORY_ALLOWLIST = [
  "intrusion", "smoke", "fall", "theft", "violence", "ppe_missing",
] as const;
```

`convex/lib/domain/severity.ts` sube a **`sev-v2`** en vez de editar `sev-v1`,
porque la spec exige versionar la politica antes de aplicarla: un incidente ya
guardado debe seguir explicandose con la regla que lo clasifico.

| Categoria | Severidad | Por que |
|---|---|---|
| `fall`, `violence` | `critical` | riesgo inmediato para una persona |
| `smoke`, `intrusion` | `high` | |
| `theft` | `medium` | perdida economica, sin riesgo para nadie |
| `ppe_missing` | `low` | incumplimiento a corregir, no una emergencia |

El mapeo de tipos vive en `backend/core/intake.py` y va **por tipo concreto
antes que por dominio**, porque seguridad industrial produce tres categorias
distintas: una caida es `fall`, la falta de casco `ppe_missing` y entrar donde
no se debe `intrusion`.

### Que impide que se vuelva a desincronizar

```powershell
.venv\Scripts\python.exe -m tools.test_taxonomia
```

Las dos taxonomias viven en repos y lenguajes distintos, asi que es facil
ampliar una y olvidar la otra. Cuando eso pasa **nada falla**: el pipeline
simplemente deja de registrar incidentes en Convex, en silencio. Ese test lee la
allowlist del TypeScript y comprueba tres cosas:

- que toda categoria permitida tiene regla de severidad (que falla cerrada)
- que el lado Python refleja exactamente esa allowlist
- que **todo tipo de incidente de todo dominio tiene destino**

Del lado de Convex, `tests/domain/domain.test.ts` comprueba lo mismo desde
dentro con `has a severity rule for every allowed category`.

---

## Puesta en marcha del backend de Convex

```powershell
cd convex-backend
pnpm install
pnpm test
```

Requiere `pnpm@11.11.0` (declarado en `packageManager`).

### Estado verificado

| | |
|---|---|
| 26 tests de logica pura | **pasan** (authz, dominio, errores, schema, validacion, workspaces) |
| 5 suites que tocan la API generada | **no arrancan todavia** |
| `pnpm typecheck` | falla por lo mismo |

Las cinco que faltan importan `convex/_generated/`, que produce `convex codegen`
y que **no esta en el repo** (correcto: es codigo generado). Generarlo pide un
deployment:

```
✖ No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project
```

**Eso solo lo puede desbloquear quien tenga la cuenta de Convex.** Basta con
correr `npx convex dev` una vez para dejar el proyecto configurado; a partir de
ahi `pnpm test` y `pnpm typecheck` pasan enteros. Hasta entonces, las suites de
detections, incidents, workspaces, chat y el harness se quedan sin poder correr.

### Dos arreglos ya aplicados

El `pnpm test` no arrancaba en una instalacion limpia, por dos motivos que no
tienen que ver con la logica:

1. El script usaba `NODE_OPTIONS=... jest`, sintaxis de shell Unix que cmd de
   Windows no entiende. Ahora va por `cross-env`.
2. `jest.config.ts` necesita `ts-node` para poder leerse, y no estaba declarado
   como dependencia. Faltaba en cualquier sistema operativo, no solo Windows.
