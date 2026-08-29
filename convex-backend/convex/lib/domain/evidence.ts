/**
 * Referencias de evidencia: `https://.../api/storage/<uuid>#video/mp4`.
 *
 * El almacenamiento de Convex sirve todo bajo la misma ruta sin extension, asi
 * que no hay forma de distinguir por la URL si una referencia es la imagen del
 * correo o el clip del panel. El pipeline marca el tipo en el fragmento: no
 * llega al servidor, los navegadores lo ignoran y la URL sigue siendo valida.
 *
 * Las referencias antiguas no llevan marca. Se tratan como imagen, que es lo
 * que eran: asi un incidente guardado antes de este cambio sigue mostrandose.
 */

export type Evidencia = { url: string; mime: string };

export function parseEvidence(refs: readonly string[]): {
  imagen: string | null;
  video: string | null;
} {
  const partidas: Evidencia[] = refs
    .filter((ref) => ref.startsWith("https://"))
    .map((ref) => {
      const corte = ref.indexOf("#");
      return corte === -1
        ? { url: ref, mime: "image/jpeg" }
        : { url: ref.slice(0, corte), mime: ref.slice(corte + 1) };
    });

  return {
    imagen: partidas.find((e) => e.mime.startsWith("image/"))?.url ?? null,
    video: partidas.find((e) => e.mime.startsWith("video/"))?.url ?? null,
  };
}
