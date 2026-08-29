# Guion de demo y pitch

## Lo que hay que dejar claro en 3 minutos

1. **El problema no es detectar, es filtrar.** Nadie mira las camaras. Y mandar
   todo a un modelo grande cuesta demasiado como para operarlo 24/7.
2. **No entrenamos un modelo, y esa es la decision tecnica.** Los datasets
   publicos de robo son imagenes estaticas o CCTV degradada: un modelo entrenado
   ahi no dispara en esta sala. La literatura de 2026 ya se movio a VLM zero-shot.
3. **Una cascada de 3 etapas resuelve coste, latencia y explicabilidad a la vez.**
4. **Un sistema, cuatro verticales.** Cambiar de dominio es cambiar un YAML.

---

## Los tres problemas que el estado del arte declara sin resolver

El proyecto que gano TreeHacks 2025 con esta misma idea publico los tres retos
que no termino de resolver. Son exactamente los tres que ataca nuestra
arquitectura, y conviene decirlo con sus palabras:

| Su reto declarado | Nuestra respuesta, medida |
|---|---|
| "Equilibrar el procesado en tiempo real con el rendimiento del navegador y los rate limits de Gemini" | Ellos corrian TensorFlow.js **en el navegador**. Nosotros nativo a 29 FPS; el cooldown por persona hace los rate limits estructuralmente imposibles |
| "Minimizar los falsos positivos" | Cascada de dos etapas medida: gesticular puntua 0,02 y pelear 1,00. Mas bucle de feedback humano que recalcula la precision en vivo |
| "Gestionar multiples streams sin saturar el sistema" | N camaras comparten **un** presupuesto de inferencia round-robin. Medido: 28,6 + 12,0 = 40,6 FPS con dos feeds en CPU |

---

## El numero que hay que decir en voz alta

| | Frames por hora a 30 FPS |
|---|---|
| Video crudo | 108.000 |
| Enfoque ingenuo: 1 frame/s al VLM | 3.600 |
| Sentinel: ~30 disparos/hora x 10 frames | **~300** |

Otros numeros medidos que conviene tener a mano:

| Que | Medido |
|---|---|
| FPS de la Etapa 0 en CPU (sin GPU) | 29,4 |
| Dos camaras a la vez, CPU | 28,6 + 12,0 = 40,6 FPS |
| Latencia de la Etapa 2 | 4,4 s con `flash-lite` (9,9 s con `flash`) |
| Analisis de un video subido | 12,5 s de video en 8,4 s |
| Discriminacion gesticular vs pelear | 0,02 vs 1,00 |
| Escenarios sinteticos que discriminan | 8 de 8 |

**99,7% de los frames nunca llegan al modelo de pago.** Con el free tier de
Gemini Flash la demo entera sale a coste cero.

Y el matiz que demuestra que entendemos el problema: si la Etapa 1 fuese un
detector por frame preguntando "hay una persona?", en una tienda filtraria el
0%, porque siempre hay alguien. Filtra porque mide **acciones en el tiempo**, no
presencia.

---

## Orden de la demo en vivo

Empezar con el dashboard ya abierto y el pipeline corriendo. Nunca arrancar
nada delante del jurado.

1. **Ensenar el video en vivo** con los esqueletos y las barras de senales al
   lado de cada persona. Aqui se ve que el sistema esta pensando todo el rato,
   gratis. "Esto corre en local a 30 FPS y no cuesta un centimo."

2. **Robo en tienda.** Coger un objeto de la mesa, mirarlo, devolverlo.
   *No dispara.* Decirlo en voz alta: "esto es un cliente normal, y el sistema
   se calla". Luego coger el objeto y metertelo en el bolsillo. La barra de
   `concealment` sube, el score cruza el umbral, aparece la tarjeta naranja
   "analizando" y a los pocos segundos el veredicto de Gemini con el clip.

3. **Caidas.** Cambiar de dominio con un clic (sin reiniciar nada) y tirarse al
   suelo. Enfatizar: "mismo sistema, mismo modelo, otro YAML".

4. **Agresion.** Dos personas del equipo simulan un forcejeo.

5. **El descarte es la funcionalidad.** Ensenar una tarjeta gris de un disparo
   que el VLM descarto. "La Etapa 1 tiene recall alto a proposito; la Etapa 2
   es la que protege al operador de las falsas alarmas."

6. **Feedback humano.** Pulsar "falso positivo" en una tarjeta y ensenar como la
   metrica de precision del cabecero se actualiza sola.

7. **Que os traigan un video.** Boton "Analizar un video": el jurado puede darte
   su propio MP4 y lo procesa mas rapido que tiempo real. Es el momento en que
   se ve que no hay truco ni escena preparada.

8. **La cronologia.** Abrir "Cronologia" en una tarjeta: `t-1.8s la mano se
   dirige al torso`, `t-1.3s permanece sobre el cuerpo`, `t+0.0s dispara`.
   Remate: "esto no lo escribio el modelo, sale de la geometria medida frame a
   frame; cada linea se puede auditar contra su numero".

9. **Preguntarle al incidente.** "Preguntar sobre este incidente" y escribir algo
   que no este en el veredicto: "¿llevaba mochila?". Se le devuelven los mismos
   frames al VLM para que mire otra vez.

---

## Preguntas que va a hacer el jurado

**"Por que no entrenaste un modelo?"**
Porque el dataset publico de shoplifting mas usado tiene el problema de que un
detector aprende el fondo de la tienda, no la accion. Y porque LAVIDA alcanza
82% AUC en UCF-Crime sin un solo ejemplo de anomalia. Entrenar habria costado
las 12 horas y habria generalizado peor.

**"Cuantos falsos positivos tiene?"**
Veesion, que es el referente comercial con millones de ejemplos etiquetados,
declara 85-90% de precision en alertas: 1 de cada 7 es falsa. Nuestro numero
medido esta en `tools/bench.py`. Lo importante es que el falso positivo lo
absorbe la Etapa 2 antes de llegar al operador, no despues.

**"Y si hay 50 personas en la tienda?"**
El cooldown es por persona (25 s en retail, 45 s en industrial), asi que el
gasto crece linealmente con los **eventos**, no con las personas ni con los
frames. Y la Etapa 0 corre en local: 50 personas no cuestan mas dinero.

**"Esto no es vigilancia masiva?"**
No usa biometria ni identifica a nadie. Las tracks son numeros que se olvidan a
los 2 segundos de que la persona sale de cuadro. Es lo contrario del
reconocimiento facial: mide gestos, no identidades.

**"Que pasa si se cae internet?"**
La Etapa 0 y la 1 siguen funcionando enteras en local; se pierde solo el
veredicto explicado. El sistema degrada, no se cae.

---

## Plan B (ensayarlo antes)

- Poner `SENTINEL_SOURCE` a un `.mp4` grabado por vosotros: se reproduce en
  bucle y dispara igual. Si la camara falla o la sala esta llena de gente,
  se cambia una variable y la demo sigue.
- Grabar un video de la demo funcionando **a las 3 horas de acabar**, no al
  final. Es el seguro contra el wifi del recinto.
- Si Gemini da rate limit en mitad de la demo: el sistema entra en modo
  offline y el pipeline sigue visible. No se rompe nada.

---

## Antes de presentar

```powershell
python -m tools.selftest                                  # 8 escenarios sinteticos
.venv\Scripts\python.exe -m tools.bench data\samples       # precision y recall reales
```

Grabar 10 clips `pos_*.mp4` y 10 `neg_*.mp4` con el movil y pasarlos por
`bench.py`. Un numero medido vale mas que cualquier adjetivo en el pitch.
