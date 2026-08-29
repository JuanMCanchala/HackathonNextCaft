/**
 * El correo de aviso.
 *
 * Quien lo abre suele ser un guardia, a menudo en el movil, a veces de noche y
 * casi siempre andando. El trabajo del correo es uno solo: que en tres
 * segundos sepa que paso, donde, y si tiene que moverse. Todo lo demas sobra.
 *
 * Tres decisiones que explican como esta hecho:
 *
 * FONDO CLARO. El disenno anterior era una tarjeta negra. Gmail en modo
 * oscuro reinvierte los correos oscuros con resultados impredecibles, y un
 * guardia que mira el movil a plena luz lee mejor sobre claro. El negro se
 * reserva para la barra de datos de la camara, donde significa algo.
 *
 * TIPOGRAFIA MONOESPACIADA EN LOS VALORES. Hora, camara y confianza van en
 * monoespaciada como el OSD que las camaras queman sobre la imagen. No es
 * decoracion: alinea las cifras en columna y hace el bloque legible de un
 * vistazo, que es justo lo que se necesita a las tres de la manana.
 *
 * DOS COLUMNAS EN ESCRITORIO. La version anterior era una columna de 560 px
 * flotando en un mar de gris. Aqui la base en linea es de una columna (movil,
 * y tambien lo que se ve si el cliente descarta el <style>) y la consulta de
 * medios la abre a dos en pantalla ancha. Si el bloque de estilos no
 * sobrevive, queda la version movil, que es correcta.
 */

export type DatosAviso = {
  category: string;
  severity: string;
  cameraLabel: string;
  openedAt: number;
  confidence: number | null;
  evidenceUrl: string | null;
  incidentUrl: string | null;
  demoUrl: string | null;
};

const ETIQUETA: Record<string, string> = {
  violence: "Agresion",
  fall: "Caida",
  smoke: "Humo",
  intrusion: "Intrusion",
  theft: "Robo",
  ppe_missing: "Falta de equipo de proteccion",
};

/**
 * Colores de senalizacion, no de interfaz. El rojo es el de una senal de
 * peligro impresa, no el naranja neon de un tema oscuro: en un aviso de
 * seguridad el color es informacion, y conviene que se lea como tal.
 */
const SEVERIDAD: Record<string, { color: string; texto: string }> = {
  critical: { color: "#C1121F", texto: "Critico" },
  high: { color: "#B45309", texto: "Alto" },
  medium: { color: "#1D4ED8", texto: "Medio" },
  low: { color: "#15803D", texto: "Bajo" },
};

const SANS =
  "font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";
const MONO =
  "font-family:ui-monospace,'SF Mono','Cascadia Mono','Segoe UI Mono',Consolas,'Liberation Mono',monospace";

function escapar(texto: string): string {
  return texto.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

export function asuntoAviso(datos: DatosAviso): string {
  const sev = SEVERIDAD[datos.severity]?.texto ?? datos.severity;
  const tipo = ETIQUETA[datos.category] ?? datos.category;
  return `${sev}: ${tipo} en ${datos.cameraLabel}`;
}

export function textoAviso(datos: DatosAviso): string {
  const tipo = (ETIQUETA[datos.category] ?? datos.category).toLowerCase();
  const hora = new Date(datos.openedAt).toLocaleString("es-ES");
  const lineas = [`Se ha detectado ${tipo} en la camara ${datos.cameraLabel}.`, `Hora: ${hora}`];
  if (datos.confidence !== null) {
    lineas.push(`Confianza del modelo: ${Math.round(datos.confidence * 100)}%`);
  }
  if (datos.incidentUrl !== null) {
    lineas.push(`Ver el incidente: ${datos.incidentUrl}`);
  }
  return lineas.join("\n");
}

export function cuerpoAviso(datos: DatosAviso): string {
  const sev = SEVERIDAD[datos.severity] ?? { color: "#4B5563", texto: datos.severity };
  const tipo = escapar(ETIQUETA[datos.category] ?? datos.category);
  const fecha = new Date(datos.openedAt);
  const dia = fecha.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  const hora = fecha.toLocaleTimeString("es-ES", { hour12: false });
  const camara = escapar(datos.cameraLabel);

  // Barra de datos sobre la imagen, con la forma del OSD que las camaras
  // queman sobre el video: identificador a la izquierda, hora a la derecha.
  const osd = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#14161A;border-radius:6px 6px 0 0">
      <tr>
        <td style="padding:9px 12px;color:#8A93A0;font-size:11px;letter-spacing:.1em;
                   text-transform:uppercase;${MONO}">CAM ${camara}</td>
        <td align="right" style="padding:9px 12px;color:#E7EAEE;font-size:11px;
                   letter-spacing:.06em;${MONO}">${escapar(dia)} ${escapar(hora)}</td>
      </tr>
    </table>`;

  const media =
    datos.evidenceUrl === null
      ? `${osd}
         <div style="border:1px solid #E2E0DC;border-top:0;border-radius:0 0 6px 6px;
                     padding:40px 16px;text-align:center;color:#8B92A0;font-size:13px;${SANS}">
           Sin imagen para este incidente
         </div>`
      : `${osd}
         <img src="${escapar(datos.evidenceUrl)}" alt="Momento de la deteccion" width="600"
              style="display:block;width:100%;height:auto;border-radius:0 0 6px 6px;border:0">`;

  const dato = (etiqueta: string, valor: string) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid #EDEBE7;color:#767D8B;
                 font-size:12px;letter-spacing:.02em;${SANS}">${etiqueta}</td>
      <td align="right" style="padding:11px 0;border-bottom:1px solid #EDEBE7;color:#14161A;
                 font-size:13px;font-weight:600;${MONO}">${valor}</td>
    </tr>`;

  const datosTabla = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${dato("Camara", camara)}
      ${dato("Detectado", `${escapar(dia)} ${escapar(hora)}`)}
      ${datos.confidence === null ? "" : dato("Confianza", `${Math.round(datos.confidence * 100)}%`)}
      ${dato("Severidad", escapar(sev.texto))}
    </table>`;

  const boton =
    datos.incidentUrl === null
      ? ""
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="margin-top:18px">
           <tr><td align="center" bgcolor="${sev.color}" style="border-radius:7px">
             <a href="${escapar(datos.incidentUrl)}"
                style="display:block;padding:15px 20px;color:#FFFFFF;font-size:14.5px;
                       font-weight:700;text-decoration:none;letter-spacing:.01em;${SANS}">
               Ver el clip completo
             </a>
           </td></tr>
         </table>
         <p style="margin:10px 0 0;text-align:center;color:#9AA1AD;font-size:11.5px;${SANS}">
           El panel muestra los segundos anteriores y posteriores
         </p>`;

  const pie =
    datos.demoUrl === null
      ? ""
      : `<a href="${escapar(datos.demoUrl)}"
            style="color:#767D8B;font-size:11.5px;text-decoration:underline;${SANS}">
           Todos los incidentes
         </a>`;

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapar(sev.texto)}: ${tipo} en ${camara}</title>
<style>
  /* Base en linea = una columna. Esto solo la abre en pantalla ancha, y si el
     cliente descarta el bloque queda la version movil, que es correcta. */
  @media screen and (min-width: 680px) {
    .marco { width: 100% !important; max-width: 940px !important; }
    .col-media { display: table-cell !important; width: 60% !important;
                 padding-right: 26px !important; vertical-align: top !important; }
    .col-datos { display: table-cell !important; width: 40% !important;
                 vertical-align: top !important; padding-top: 0 !important; }
    .titulo { font-size: 34px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .lienzo { background: #101215 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#E8E6E1;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  ${tipo} en ${camara}, ${escapar(hora)}. Confianza ${datos.confidence === null ? "no disponible" : `${Math.round(datos.confidence * 100)}%`}.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       class="lienzo" style="background:#E8E6E1">
<tr><td align="center" style="padding:20px 14px 34px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="marco"
         width="100%" style="max-width:600px;background:#FFFFFF;border-radius:10px;
                             box-shadow:0 1px 3px rgba(20,22,26,.10)">
    <tr>
      <!-- Lomo de severidad: el color recorre la tarjeta entera, asi la
           gravedad se lee antes que cualquier palabra. -->
      <td width="6" bgcolor="${sev.color}"
          style="width:6px;border-radius:10px 0 0 10px;font-size:0;line-height:0">&nbsp;</td>
      <td style="padding:26px 26px 24px">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="color:${sev.color};font-size:11px;font-weight:700;letter-spacing:.13em;
                       text-transform:uppercase;${MONO}">${escapar(sev.texto)}</td>
            <td align="right" style="color:#9AA1AD;font-size:11px;letter-spacing:.08em;
                       text-transform:uppercase;${MONO}">Sentinel</td>
          </tr>
        </table>

        <h1 class="titulo" style="margin:12px 0 3px;color:#14161A;font-size:28px;
                   font-weight:700;letter-spacing:-.025em;line-height:1.12;${SANS}">${tipo}</h1>
        <p style="margin:0 0 20px;color:#767D8B;font-size:14px;${SANS}">
          Camara ${camara} &middot; ${escapar(hora)}
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="col-media" style="display:block;width:100%">
              ${media}
            </td>
            <td class="col-datos" style="display:block;width:100%;padding-top:22px">
              ${datosTabla}
              ${boton}
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin-top:24px;border-top:1px solid #EDEBE7">
          <tr>
            <td style="padding-top:14px;color:#9AA1AD;font-size:11.5px;line-height:1.55;${SANS}">
              Este aviso solo sale cuando el verificador confirma el incidente.
              Las sospechas descartadas no llegan a tu bandeja.
            </td>
            <td align="right" style="padding-top:14px;white-space:nowrap">${pie}</td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</td></tr>
</table>
</body></html>`;
}
