# Demos y opciones de URL

La sección **Demo** del menú del editor descarga el MusicXML de `public/demos/` al elegir una canción y lo importa en una pestaña nueva. Usa el mismo importador que los archivos locales y conserva el título y el autor del archivo.

Cada apertura crea una copia independiente que se puede editar o borrar sin cambiar la demo original. Estas copias no aparecen en la lista de partituras propias, tampoco después de recargar la página. Cerrar su pestaña descarta la copia; elegir la demo de nuevo vuelve a descargar el original.

«Canto en la rama» se abre con Voces, reproducción e intervalos activos, timbre Uh y el banner oculto, equivalentes a `?tools=voices,play,intervals&sound=uh&banner=hide`.

La URL puede fijar los grupos de herramientas activos al abrir la página:

```text
/es/?tools=voices,play,intervals&sound=oh
```

- `tools`: lista separada por comas. Admite `voices`, `play` (o `playback`), `intervals`, `repeats` y `dynamics`. Los grupos omitidos quedan apagados; `tools=` los apaga todos. La biblioteca de patrones queda oculta en estas URLs.
- `sound`: identificador del timbre de coro, como `ah`, `oh` o `uh` (también admite el identificador guardado `mm`), o uno de los identificadores adicionales ofrecidos por Ajustes. Un identificador desconocido se ignora.
- `tools=voices` o `sound`: habilitan el instrumento Voces y la importación de las tres voces del MusicXML en tres pentagramas, sin necesidad de agregar `#pro`.
- `banner=hide`: oculta el banner de bienvenida desde el primer render, solo en esa visita. No escribe cookies ni localStorage; al abrir una URL sin ese parámetro vuelve a mostrarse, salvo que ya se hubiera cerrado manualmente.

Las opciones de herramientas y sonido se aplican a las partituras guardadas al arrancar, y a las nuevas o importadas durante esa sesión. Se pueden modificar desde Ajustes y se guardan con la partitura. Sin parámetros se conserva el comportamiento habitual.
