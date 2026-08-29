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

## Lo que hay que decidir: la taxonomia

**Este es el bloqueo real, y es una decision de producto.**

Convex acepta tres categorias (`convex/lib/domain/normalize.ts`):

```ts
export const CATEGORY_ALLOWLIST = ["intrusion", "smoke", "fall"] as const;
```

El pipeline de vision produce unos veinte tipos repartidos en cuatro dominios.
El mapeo actual, en `backend/core/intake.py`:

| Dominio | Tipo | Va a Convex como |
|---|---|---|
| `fall_detection` | cualquier caida | `fall` |
| `industrial_safety` | invasion de zona restringida | `intrusion` |
| `industrial_safety` | caida o accidente | `fall` |
| `industrial_safety` | **falta de equipo de proteccion** | **no se envia** |
| `retail_theft` | **todos** | **no se envia** |
| `violence` | **todos** | **no se envia** |

Tres de los cuatro dominios no tienen sitio, **incluido robo en tienda, que es
la demo principal**. Ahora mismo un robo detectado y confirmado por el VLM no
queda registrado en Convex.

El puente prefiere **no enviar** antes que colar un robo como `intrusion`: sus
metricas de incidentes quedarian sucias y nadie sabria por que.

### La ampliacion, si se decide hacerla

Son dos ficheros y unas seis lineas. La severidad **falla cerrada** a proposito
(lanza si falta la regla), asi que hay que tocar las dos.

`convex/lib/domain/normalize.ts`

```ts
export const CATEGORY_ALLOWLIST = [
  "intrusion", "smoke", "fall", "theft", "violence", "ppe_missing",
] as const;
```

`convex/lib/domain/severity.ts` — y **subiendo la version de la regla**, porque
su propia spec dice que las politicas de categoria y severidad se versionan
antes de aplicarse:

```ts
export const SEVERITY_RULE_VERSION = "sev-v2";

const SEV_V2: Record<NormalizedCategory, OperationalSeverity> = {
  fall: "critical",
  violence: "critical",
  smoke: "high",
  intrusion: "high",
  theft: "medium",
  ppe_missing: "low",
};
```

Y despues, en `backend/core/intake.py`, cambiar `POR_DOMINIO` y `POR_TIPO` para
que dejen de devolver `None`.

Hay tests que afirman la lista actual (`tests/domain/domain.test.ts`,
`tests/detections/detections.test.ts`), asi que habra que actualizarlos.

**No lo he aplicado yo**: es codigo de la otra mitad del equipo, cambia una
politica versionada y afecta a sus tests. Queda listo para que sea una decision
de dos minutos, no una tarde de arqueologia.

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
