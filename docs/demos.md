# Demos y opciones de URL

La sección **Demo** del menú del editor descarga el MusicXML de `public/demos/` al elegir una canción y lo importa en una pestaña nueva. Usa el mismo importador que los archivos locales y conserva el título y el autor del archivo.

La URL puede fijar los grupos de herramientas activos al abrir la página:

```text
/es/?tools=voices,play,intervals&sound=oh#pro
```

- `tools`: lista separada por comas. Admite `voices`, `play` (o `playback`), `intervals`, `repeats` y `dynamics`. Los grupos omitidos quedan apagados; `tools=` los apaga todos. La biblioteca de patrones queda oculta en estas URLs.
- `sound`: identificador del timbre de coro, como `ah`, `oh` o `mm` (Uh), o uno de los identificadores adicionales ofrecidos por Ajustes. Un identificador desconocido se ignora.
- `#pro`: sigue siendo necesario para el instrumento Voces y para separar las tres voces del MusicXML en tres pentagramas.

Estas opciones se aplican a las partituras guardadas al arrancar, y a las nuevas o importadas durante esa sesión. Se pueden modificar desde Ajustes y se guardan con la partitura. Sin parámetros se conserva el comportamiento habitual.
