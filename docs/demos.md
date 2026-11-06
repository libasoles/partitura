# Demos y opciones de URL

La sección **Demo** del menú del editor descarga el MusicXML de `public/demos/` al elegir una canción y lo importa en una pestaña nueva. Usa el mismo importador que los archivos locales y conserva el título y el autor del archivo.

Cada apertura crea una copia independiente que se puede editar o borrar sin cambiar la demo original. Estas copias no aparecen en la lista de partituras propias, tampoco después de recargar la página. Cerrar su pestaña descarta la copia; elegir la demo de nuevo vuelve a descargar el original.

«Canto en la rama» se abre con Voces, reproducción e intervalos activos, timbre Uh y el banner oculto, equivalentes a `?tools=voices,play,intervals&sound=uh&banner=hide`.

Al cargar una demo, la barra de direcciones se actualiza sin recargar la página. Se puede copiar ese enlace para compartir el original, con sus opciones:

```text
https://partitura.com.ar/es/demos/canto-en-la-rama/?tools=voices,play,intervals&sound=uh&banner=hide
```

Cada demo tiene una página estática propia en cada idioma, con título, autor, descripción, Open Graph, Twitter Cards, canonical y hreflang generados en el HTML inicial. La URL sin parámetros también carga la canción y sus opciones predeterminadas. El catálogo está en `src/client/demos.js` y las páginas se generan desde `src/pages/[locale]/demos/[demo].astro`.

Abrir el enlace importa la canción automáticamente; si ya hay una copia de esa demo en el navegador, la activa sin duplicarla. Las ediciones locales no se comparten. Crear, editar o importar partituras propias no actualiza la URL. También se acepta `?demo=canto-en-la-rama` en el editor; solo admite identificadores del catálogo publicado.

La URL puede fijar los grupos de herramientas activos al abrir la página:

```text
/es/?tools=voices,play,intervals&sound=oh
```

- `tools`: lista separada por comas. Admite `voices`, `play` (o `playback`), `intervals`, `repeats` y `dynamics`. Los grupos omitidos quedan apagados; `tools=` los apaga todos. La biblioteca de patrones queda oculta en estas URLs.
- `sound`: identificador del timbre de coro, como `ah`, `oh` o `uh` (también admite el identificador guardado `mm`), o uno de los identificadores adicionales ofrecidos por Ajustes. Un identificador desconocido se ignora.
- `tools=voices` o `sound`: habilitan el instrumento Voces y la importación de las tres voces del MusicXML en tres pentagramas, sin necesidad de agregar `#pro`.
- `banner=hide`: oculta el banner de bienvenida desde el primer render, solo en esa visita. No escribe cookies ni localStorage; al abrir una URL sin ese parámetro vuelve a mostrarse, salvo que ya se hubiera cerrado manualmente.

Las opciones de herramientas y sonido se aplican a las partituras guardadas al arrancar, y a las nuevas o importadas durante esa sesión. Se pueden modificar desde Ajustes y se guardan con la partitura. Sin parámetros se conserva el comportamiento habitual.
