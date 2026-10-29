# ISDIN LAB → Resolume Arena

## Abrir la salida

1. Descomprime todo el proyecto y abre `index.html` en Chrome o Edge actualizado.
2. Pulsa **Salida de video**. Permite la ventana emergente si el navegador la bloquea.
3. La ventana **ISDIN LAB — SALIDA LIMPIA** muestra exclusivamente la esfera, sin texto ni controles. Recibe el mismo canvas de la aplicación, a 1920 × 1080 y hasta 60 fps según el equipo.
4. Usa **F** o doble clic en esa ventana para pantalla completa. Puedes moverla a otro monitor. Reproduce y ajusta la locución desde la ventana principal.
5. Mantén visible la salida y ambas ventanas abiertas. Evita minimizarlas o ponerlas detrás de una aplicación que las oculte completamente: el navegador puede reducir o suspender el renderizado.

La ventana de salida lleva video solamente. La locución se reproduce en la aplicación principal. La exportación WebM y esta salida se usan por separado; cierra la salida si necesitas exportar un archivo.

## NDI hacia Arena (Mac o Windows)

Este HTML **no es un emisor NDI nativo**. La ruta utiliza un puente local:

**ISDIN LAB → captura de ventana en OBS → DistroAV → NDI → Resolume Arena**

1. Utiliza OBS Studio con el complemento gratuito [DistroAV](https://github.com/DistroAV/DistroAV) y los requisitos NDI indicados por su instalador. No se ha instalado ni descargado ningún complemento automáticamente.
2. En OBS, configura el lienzo y la resolución de salida a **1920 × 1080**. Elige 30 o 60 fps según la capacidad de tu equipo.
3. Añade una **Captura de ventana** y selecciona **ISDIN LAB — SALIDA LIMPIA**. En macOS puede aparecer bajo **Captura de pantalla de macOS** en modo ventana; concede a OBS el permiso de grabación de pantalla cuando lo solicite.
4. Captura solo el contenido de la ventana. Recorta los bordes o la barra del navegador si aparecen, conserva 16:9 y ajusta la fuente al lienzo. No captures la ventana de controles.
5. En los ajustes de salida NDI de DistroAV, activa **Main Output / salida principal** y dale el nombre **ISDIN LAB**. La ubicación del menú depende de la versión del complemento.
6. En Resolume Arena abre **Sources / Fuentes**, busca la fuente NDI llamada **ISDIN LAB** y arrástrala a un clip.
7. Si OBS y Arena están en equipos distintos, usa la misma red local, preferentemente Ethernet. Permite el tráfico NDI en el firewall cuando corresponda.

Si necesitas transportar la locución por NDI, añade también la captura de audio del navegador en OBS y comprueba que no suene dos veces. La ventana limpia está silenciada deliberadamente.

## Syphon

Syphon es exclusivo de macOS y requiere un emisor nativo. Un HTML en el navegador no puede publicar directamente una textura Syphon. Arena puede recibir una fuente Syphon, pero para esta ventana hace falta un puente de captura que **emita** Syphon y sea compatible con tu versión de macOS. No confundas una entrada «Syphon Client» con una salida Syphon.

Para esta entrega la ruta documentada es NDI mediante OBS y DistroAV, sin cambiar el renderizado de ISDIN. También puedes usar un capturador de ventanas compatible con Arena si ya lo tienes configurado.

## Alcance comprobado

La ventana limpia y el flujo del canvas se verifican en navegador. La conexión completa con OBS/DistroAV/Arena requiere esos programas en tu equipo y debe comprobarse allí antes del evento.
