import { parseEvidence } from "../../convex/lib/domain/evidence";

/**
 * Que referencia va al correo y cual al panel. Se separa aqui porque el error
 * es silencioso en las dos direcciones: un video en el correo sale como un
 * hueco roto, y una URL local en cualquiera de los dos no carga nunca.
 */

describe("referencias de evidencia", () => {
  it("separa la imagen del correo del video del panel", () => {
    const refs = [
      "https://x.convex.cloud/api/storage/aaa#image/gif",
      "https://x.convex.cloud/api/storage/bbb#video/mp4",
    ];
    expect(parseEvidence(refs)).toEqual({
      imagen: "https://x.convex.cloud/api/storage/aaa",
      video: "https://x.convex.cloud/api/storage/bbb",
    });
  });

  it("una referencia sin marca cuenta como imagen", () => {
    // Compatibilidad: los incidentes guardados antes de que hubiera video no
    // llevan marca, y eran imagenes. Sin esto dejarian de mostrarse.
    const refs = ["https://x.convex.cloud/api/storage/ccc"];
    expect(parseEvidence(refs).imagen).toBe("https://x.convex.cloud/api/storage/ccc");
    expect(parseEvidence(refs).video).toBeNull();
  });

  it("descarta lo que apunta al equipo del analisis", () => {
    const refs = ["http://192.168.1.40:8000/clips/x_03.jpg"];
    expect(parseEvidence(refs)).toEqual({ imagen: null, video: null });
  });

  it("con solo video no inventa una imagen", () => {
    // Si el correo recibiera el mp4 saldria un hueco roto: mejor sin imagen.
    const refs = ["https://x.convex.cloud/api/storage/ddd#video/mp4"];
    expect(parseEvidence(refs).imagen).toBeNull();
    expect(parseEvidence(refs).video).toBe("https://x.convex.cloud/api/storage/ddd");
  });

  it("sin referencias no hay nada", () => {
    expect(parseEvidence([])).toEqual({ imagen: null, video: null });
  });
});
