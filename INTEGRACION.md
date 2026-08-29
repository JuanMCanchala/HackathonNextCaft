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

El deployment de desarrollo en la nube ya existe:

```
https://adamant-mouse-956.convex.cloud     API
https://adamant-mouse-956.convex.site      HTTP actions
https://dashboard.convex.dev/d/adamant-mouse-956   panel
```

```
CONVEX_INTAKE_URL=https://adamant-mouse-956.convex.site/intake
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
| Suite completa | **59 tests en 11 suites, todos pasan** |
| `pnpm typecheck` | limpio |
| Deployment dev en la nube | `adamant-mouse-956`, responde 200 |
| Esquema, indices y funciones | desplegados |

Las variables de Clerk estan puestas en el deployment con los valores que
documenta `.env.example` (el issuer domain es configuracion publica, no un
secreto). Si cambia la instancia de Clerk:

```powershell
cd convex-backend
.
ode_modules\.bin\convex env set CLERK_JWT_ISSUER_DOMAIN <nuevo>
.
ode_modules\.bin\convex env set CLERK_JWT_APPLICATION_ID convex
```

### Circuito cerrado y verificado

El intake era `internalMutation` y **no habia router HTTP**, asi que el pipeline
de vision no tenia por donde entrar: su propia spec pedia un "authenticated
internal adapter" que estaba sin implementar. Ahora existe en `convex/http.ts`.

Autentica con `INTAKE_SERVICE_TOKEN` (token de servicio, no Clerk), asi que un
navegador con sesion de Clerk no puede llamarlo, que es lo que exige la spec. Si
el token no esta configurado el endpoint responde 503: falla cerrado, nunca
abierto.

Probado de punta a punta contra el deployment en la nube:

| | |
|---|---|
| Incidente enviado desde Python | `theft`, severidad `medium` por `sev-v2`, estado `detected` |
| Reenvio del mismo evento | no duplica; una sola deteccion |
| Tests del adaptador | 7, incluidos los negativos de autenticacion |
| Suite completa | 66 tests en 12 suites |

Los datos sembrados para la demo:

```
workspace  k97eyfq3jatnc7jfgh2pj0ptah8dd2q6   "Sentinel Demo"
camara     j97ap7zy1d9bsen8fy0x4wpq8d8dd9xy   "Entrada"
camara     j97bf9hd9raf97nvqbp09vpths8dcfxx   "Almacen"
```

Estan ya en el `.env` de la raiz, con el token de servicio. Falta solo
`PUBLIC_BASE_URL` apuntando a un tunel para que los `evidenceRefs` sean
descargables desde fuera.

### Lo que falta para produccion

`convex deploy` publica al deployment de **produccion** del proyecto, que aun no
existe. Es un paso deliberado y no lo he dado: conviene decidir antes si la demo
va contra dev (mas simple, ya funciona) o si hace falta prod de verdad.

### Dos arreglos ya aplicados

El `pnpm test` no arrancaba en una instalacion limpia, por dos motivos que no
tienen que ver con la logica:

1. El script usaba `NODE_OPTIONS=... jest`, sintaxis de shell Unix que cmd de
   Windows no entiende. Ahora va por `cross-env`.
2. `jest.config.ts` necesita `ts-node` para poder leerse, y no estaba declarado
   como dependencia. Faltaba en cualquier sistema operativo, no solo Windows.
