# Avisos: llamada y correo cuando se abre un incidente grave

## Que hace

Cuando el pipeline de vision confirma un incidente y este **abre** un registro
nuevo en Convex, se dispara un aviso humano:

- **Llamada de telefono** (Twilio). Una voz lee el tipo de incidente y la camara.
- **Correo** (Resend).

Por defecto la llamada solo sale con severidad `critical` (agresion y caida en
`sev-v2`) y el correo desde `high` (anade humo e intrusion). El robo, que es
`medium`, no avisa por ningun canal salvo que se baje el umbral a proposito.

## Por que avisa por incidente y no por deteccion

Una pelea de treinta segundos entra como decenas de detecciones. Convex las
agrupa en **un** incidente: solo la primera lleva `disposition: "created"`.
Enganchar el aviso ahi da una llamada por pelea sin escribir logica de
antirrebote. Las siguientes llegan como `grouped` y la politica las descarta.

## Como llega hasta ahi

```
pipeline  ->  POST /intake  ->  detections.acceptNormalized
                                        |
                                        |  ctx.scheduler.runAfter(0, ...)
                                        v
                                 alerts.dispatch  (action)
                                   |          |
                                Twilio      Resend
                                   |          |
                                   v          v
                             incidentTimeline: alert.sent / alert.failed
```

Va por el planificador y no en linea: un proveedor lento o caido no puede
retrasar el intake ni hacer perder el incidente. Y como `runAfter` dentro de
una mutation es transaccional, un incidente que no llega a guardarse tampoco
llama a nadie.

## Configuracion

Todo por variables de entorno del deployment. **Sin ellas el sistema no avisa y
no falla**: deja `alert.skipped` en la linea de tiempo del incidente. Un canal
al que le falte una sola variable se considera no configurado y ni se intenta.

### Correo (Resend)

```
npx convex env set RESEND_API_KEY re_xxxxxxxx
npx convex env set ALERT_EMAIL_FROM "alertas@tudominio.com"
npx convex env set ALERT_EMAIL_TO "guardia@tudominio.com,jefe@tudominio.com"
```

`ALERT_EMAIL_FROM` tiene que ser un dominio verificado en Resend. Para probar
sin dominio propio vale `onboarding@resend.dev`.

### Llamada (Twilio)

```
npx convex env set TWILIO_ACCOUNT_SID ACxxxxxxxx
npx convex env set TWILIO_AUTH_TOKEN xxxxxxxx
npx convex env set TWILIO_FROM "+1XXXXXXXXXX"
npx convex env set ALERT_PHONE_TO "+34XXXXXXXXX"
```

En cuenta de prueba Twilio solo llama a numeros **verificados** en la consola.
Si el numero de destino no lo esta, la llamada falla con un 21219 y queda como
`alert.failed` en la linea de tiempo: mirar ahi antes de dar por roto el aviso.

### Umbrales (opcional)

```
npx convex env set ALERT_CALL_MIN_SEVERITY critical    # por defecto
npx convex env set ALERT_EMAIL_MIN_SEVERITY high       # por defecto
```

Valores validos: `low`, `medium`, `high`, `critical`. Un valor que no se
reconoce vuelve al de por defecto en vez de abrir la puerta: una errata en una
variable de entorno no puede acabar llamando por un incidente menor.

## Rastro

Cada intento queda en `incidentTimeline` del incidente:

| tipo            | cuando                                                          |
| --------------- | --------------------------------------------------------------- |
| `alert.sent`    | el proveedor acepto el envio                                    |
| `alert.failed`  | el proveedor rechazo o no respondio; el motivo va en `detail`   |
| `alert.skipped` | no habia canal configurado, o la severidad no llegaba al umbral |

Un incidente agrupado no deja rastro: que no vuelva a sonar el telefono es lo
normal, no una noticia.

El cuerpo de error del proveedor se guarda recortado y **con las credenciales
tachadas**: esos mensajes suelen repetir el token que les has mandado, y la
linea de tiempo la lee cualquier miembro del workspace.

## Comprobarlo sin esperar a una pelea

Manda una observacion al intake con categoria `violence`:

```powershell
$cuerpo = @{
  workspaceId     = "<id del workspace>"
  cameraId        = "<id de la camara>"
  sourceNamespace = "prueba-manual"
  sourceEventId   = "prueba-$(Get-Random)"
  timestamp       = (Get-Date).ToUniversalTime().ToString("o")
  category        = "violence"
  confidence      = 0.9
  modelVersion    = "manual"
  detectorVersion = "manual"
} | ConvertTo-Json

curl.exe -s -X POST "https://adventurous-wolf-401.convex.site/intake" `
  -H "Authorization: Bearer $env:INTAKE_SERVICE_TOKEN" `
  -H "Content-Type: application/json" -d $cuerpo
```

Reenviar el **mismo** `sourceEventId` no vuelve a avisar: se resuelve como
`duplicate`. Para provocar un segundo aviso hace falta un incidente nuevo, es
decir, otro `sourceEventId` fuera de la ventana de agrupacion.
