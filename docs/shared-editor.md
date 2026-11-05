# Editor compartido con guitar-chords

Este repositorio mantiene el sitio Astro y la implementación reutilizable del editor. No hace falta otro repositorio ni publicar en npm.

`guitar-chords` instala `partitura` como dependencia de desarrollo desde GitHub, fijada a un commit completo. `npm ci` instala esa revisión y `npm run build:site` la compila dentro de sus assets. El navegador carga JS, chunks, Verovio/WASM y jsPDF desde el propio sitio; no consulta GitHub ni un CDN para ejecutar el editor.

## Responsabilidades

- **Compartidas:** modelo, voces, digitación, interacción del editor, importación/exportación, persistencia, diálogos, notificaciones y componente de tablaturas. El render inicial y el navegador usan el mismo modelo y versión de Verovio.
- **De cada sitio:** HTML, CSS, textos, navegación y posición de las herramientas. `bindActions` conecta botones propios a las acciones compartidas; no consulta una disposición particular.
- **Configurables al arrancar:** `defaultClef` (`treble` aquí, `guitar` en guitar-chords), `saveDelay` (300 ms aquí, 0 allá), `vendorBase`, `bindActions` y `settings` (engranaje con instrumento, tempo y grupos de herramientas; apagado por defecto porque su popup se estiliza en `editor.css`). Con `settings` el modelo se crea con `grandStaff` y el piano se dibuja como gran pentagrama (ver `AGENTS.md`); sin él, un solo pentagrama como siempre.

- **Acordes (`chords`):** apagado por defecto, como `settings`. Con `startEditor({ chords: true })` la guitarra ofrece escribir nombres de acorde sobre el pentagrama y ver su digitación (ver `AGENTS.md`). Necesita el diccionario de `guitar-chords`, que `buildEditor` publica en `vendor/` como `chords-<hash>.json` (y su buscador, empaquetado, como `chord-search-<hash>.js`) si esa dependencia se resuelve, y los estilos `.score-chord-*` y `.chord-diagram*` de `editor.css`, que son de cada sitio.

Se conserva el formato y las claves de los datos guardados. Los sitios mantienen almacenamientos separados por origen.

## Integración

El adaptador del consumidor importa `startEditor` de `partitura/editor` y lo llama después de que exista el HTML del editor. La estructura del pentagrama, paletas y pestañas conserva los identificadores `score*` de `EditorPage.astro`; la API no es todavía un componente que pueda montarse varias veces en una página.

`bindActions` recibe `loadFile(file)`, `exportMusicXml()`, `exportMidi()`, `exportPdf(button)` y `warm()`. La lógica compartida carga el exportador cuando se necesita y muestra los errores traducidos. El sitio controla sus menús y eventos.

Durante el build:

```js
const { buildEditor } = await import('partitura/build');
await buildEditor({ entryPoint: 'src/site/score-editor.js', outdir: 'dist/site/assets' });
```

Publicar el entry generado con `type="module"`, sus `score-chunks/` y `vendor/`. `vendorBase` debe apuntar al directorio público de estos últimos y terminar en `/`. El build del consumidor puede aplicar su fingerprinting habitual después.

Para Node/CommonJS se exponen `partitura/model` (con `createScoreModel`), `partitura/fingering` y `partitura/io` (ambos con `default`). `npm` genera estos adaptadores en `prepare`. `partitura/staff` expone el render inicial del pentagrama para el build.

## Actualizar la dependencia

1. Corregir y verificar el editor en este repositorio; hacer commit y push.
2. En guitar-chords ejecutar `npm install --save-dev 'git+https://github.com/libasoles/partitura.git#<commit-completo>'`.
3. Revisar y versionar `package.json` y `package-lock.json`, ejecutar las verificaciones del consumidor y desplegarlo.

Una corrección se mantiene una sola vez, pero no modifica silenciosamente un sitio ya publicado. No se consume `main` como versión flotante. El consumidor sigue funcionando con su revisión hasta que se actualice y vuelva a generar su sitio.

Los estilos de presentación siguen siendo locales: un cambio visual que deba llegar a ambos sitios requiere revisar ambos CSS.

## Sincronización automática

En guitar-chords, **Update Partitura** consulta este repositorio aproximadamente cada 15 minutos y abre o actualiza un único PR con la revisión nueva. Usa el `GITHUB_TOKEN` del consumidor; no requiere secretos entre repositorios.

Ese PR ejecuta explícitamente la CI completa de guitar-chords. Solo se mergea si el build, las pruebas unitarias y todas las suites de navegador pasan para su commit exacto. El integrador comprueba el autor del bot, el origen de la rama, los dos archivos permitidos y que no cambie otra dependencia declarada. Un fallo deja el PR abierto; si `main` avanzó, el actualizador debe refrescarlo y probarlo de nuevo.

El merge inicia explícitamente otra ejecución de CI en `main`, que despliega el sitio si todo pasa. Estas ejecuciones explícitas evitan depender de eventos de push generados por `GITHUB_TOKEN`, que GitHub normalmente no propaga a otros workflows. Ver [la documentación de eventos de GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Para reintentar un fallo o revisar novedades de inmediato, ejecutar **Update Partitura** desde Actions en guitar-chords. Los cambios nuevos no llegan al sitio publicado hasta superar esas verificaciones y el despliegue.
