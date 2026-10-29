# ISDIN LAB — Esfera iridiscente audioreactiva

Proyecto HTML local con tu locución original incluida (52,4 segundos). La voz modifica las ondas, la anchura, la torsión y el tamaño de la esfera. **El movimiento se detiene durante los silencios** después de una breve transición. Todo se procesa en tu navegador, sin servicios de pago ni peticiones externas.

## Abrir y reproducir

1. Descomprime el ZIP conservando sus carpetas.
2. Abre `index.html` en Chrome o Edge actualizado.
3. Pulsa **Reproducir**. El MP3 ya está cargado.
4. Pulsa **H** para ocultar/mostrar controles y **F** para pantalla completa.

También puedes ejecutar un servidor local desde la carpeta del proyecto:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Abre http://localhost:8080. En Windows puedes usar `py -m http.server 8080 --bind 127.0.0.1`. Cierra el servidor con `Ctrl+C`. No hacen falta npm, compilación, cuentas ni conexión a Internet.

## Respuesta de voz y pausas

- Sensibilidad inicial **1,8×**, movimiento **100 %** y luminosidad **100 %**. Todos son ajustables.
- La detección usa el **RMS real**, no la envolvente residual: umbrales con histéresis para distinguir voz y ruido.
- La voz abre las ondas y acelera su flujo y torsión. La esfera crece hasta un **22 %** sobre el tamaño de reposo; esta expansión acompaña a las deformaciones internas.
- Al desaparecer la señal, la respuesta se cierra suavemente y llega a cero exacto aproximadamente **160 ms después de que el analizador detecte el silencio**. El propio analizador tiene una ventana temporal adicional. Las pausas breves entre fonemas tienen un pequeño margen de histéresis para evitar vibraciones nerviosas.
- En silencio quedan congelados los relojes de flujo y color, las ondas y la expansión. La esfera permanece visible. Al volver la voz, continúa suavemente.
- Los controles de sensibilidad afectan a la imagen y mantienen el nivel original del sonido.

Esta conducta de pausa sustituye al movimiento permanente en reposo de versiones anteriores, siguiendo la última indicación del proyecto.

## Cristal e iridiscencia

La escena usa cuatro bandas tridimensionales con normales analíticas, capas de luz, interferencias de color y una envolvente de cristal deformable. Una segunda pasada refracta el **interior realmente renderizado**, con dispersión cromática suave. Los reflejos y el resplandor HDR se componen en el mismo canvas que se captura al exportar.

El fondo es azul hielo claro. La composición mantiene 16:9, con diámetro de reposo inicial del 45 % de la altura y crecimiento al hablar. No hay imágenes estáticas animadas, vídeo pregrabado de la esfera ni partículas externas. Es un material procedural en tiempo real, no un trazado físico completo de refracción.

El archivo `muestra-movimiento.mp4` permite revisar ocho segundos de la locución, incluidos intervalos de silencio. La muestra se renderizó localmente a 960 × 540 y 24 fps y se codificó con FFmpeg; no es una exportación MP4 directa del navegador.

## Audio y marcadores

El MP3 original está en `assets/locucion-isdin.mp3`. `assets/locucion.js` incluye una copia codificada para abrir también el HTML directamente sin servidor. La aplicación utiliza `AudioContext`, `AnalyserNode`, RMS, envolvente, graves, medios, agudos y ataques. El sonido de reproducción y grabación mantiene ganancia unitaria.

La pestaña **Guion** conserva el texto oficial. En **Narrativa** están los doce eventos, con cinco marcadores independientes para los números finales. Los tiempos incluidos se obtuvieron de pausas medidas y del orden del guion; son iniciales, editables y no están verificados mediante reconocimiento de palabras. Los cinco bloques finales comienzan aproximadamente en 48,19 / 49,16 / 50,04 / 50,90 / 51,87 segundos.

Puedes ajustar los segundos o pulsar **Ahora** mientras escuchas, y guardar/abrir un JSON. Al cargar otro WAV o MP3 se borran los marcadores anteriores para evitar sincronías incorrectas. El análisis de voz sigue siendo la fuente principal de reacción; los eventos narrativos lo complementan y respetan la pausa del movimiento en silencio.

## Exportar

Carga o utiliza la locución incluida, ajusta los parámetros y pulsa **Exportar con audio**. Se graba toda la locución desde el comienzo mediante `canvas.captureStream()` y `MediaRecorder`, combinando el vídeo y la salida original del mismo grafo Web Audio.

Se solicita **WebM 1920 × 1080 a 60 fps** con composición limpia. Los fps efectivos dependen del equipo. Mantén la pestaña visible y evita el reposo del ordenador; ocultarla detiene y guarda una exportación parcial. **Detener y guardar parcial** permite terminar antes.

El navegador vuelve a codificar el audio (habitualmente Opus); no conserva el códec MP3 original. La aplicación ofrece WebM cuando el navegador lo admite. Chrome y Edge actuales son los recomendados; Safari puede tener limitaciones de códecs y captura. No hay un render offline ni una exportación MP4 directa en el HTML.

Para convertir el WebM a MP4 H.264/AAC con FFmpeg local:

```sh
ffmpeg -i isdin-lab.webm -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart isdin-lab.mp4
```

## Validación y rendimiento

Verificado en Chromium con renderizado por software:

- Sintaxis JavaScript y compilación GLSL sin errores.
- Voz normal de prueba RMS 0,07 → intensidad aproximada 0,79; voz más fuerte → respuesta mayor.
- Pausa exacta pese a una envolvente residual: relojes y parámetros se congelan y **los fotogramas de silencio son idénticos píxel a píxel**.
- Con voz normal, crecimiento superior al 15 %; en la muestra real, el máximo observado se acerca al 22 %.
- 192 fotogramas con datos reales del MP3, flujo y torsión activos en voz y reposo exacto en silencios.
- Framebuffers HDR y alternativa RGBA8 sin HDR operativos; captura a 1920 × 1080 sin errores WebGL.
- En versiones anteriores se verificaron los controles, pantalla completa, diseño móvil, marcadores y exportación WebM con pistas VP9/Opus. La ruta de audio y los controles principales se conservan.

La máquina de prueba no dispone de M1 Max ni RTX 5070. Los 60 fps y la sincronía final de entrega deben ensayarse con la locución completa en el equipo del evento y con aceleración gráfica activa. La resolución de previsualización se ajusta automáticamente al rendimiento. La resolución de exportación queda fija en 1080p.

Se volvió a intentar abrir el video de YouTube indicado, también en un navegador, pero el acceso al reproductor estuvo bloqueado en el entorno. No se afirma una comparación exacta con ese video.

## Archivos

| Archivo | Función |
| --- | --- |
| `index.html`, `styles.css` | Entrada y controles |
| `src/orb.js` | Geometría, cristal, refracción, iridiscencia y render |
| `src/voice-response.js` | Sensibilidad, histéresis y detención en silencios |
| `src/audio.js` | Audio, análisis y reloj de reproducción |
| `src/markers.js` | Guion y eventos narrativos |
| `src/recorder.js` | Exportación audiovisual WebM |
| `src/app.js` | Integración e interacción |
| `assets/` | Tu MP3, carga local y marcadores iniciales |
| `vendor/` | Three.js r160.1 y su licencia MIT |
| `tests/` | Pruebas técnicas y señal sintética, ajena a la locución oficial |

Las pruebas de navegador usan `playwright-core` y Chromium únicamente como herramientas de desarrollo. No son dependencias de la aplicación. La prueba pura de respuesta puede ejecutarse con `node tests/voice-response-check.cjs` sin instalar paquetes.
