# Instrucciones del proyecto

## Flujo de trabajo

- Al terminar los cambios solicitados, ejecutar las verificaciones pertinentes, hacer commit y push a la rama de trabajo, salvo indicación contraria del usuario.
- Revisar el diff antes del commit y conservar los cambios previos del usuario.
- Mantener las instrucciones compartidas en este archivo. `CLAUDE.md` debe cargarlas mediante `@AGENTS.md`, sin duplicarlas.

## Favicon y logo

- `public/favicon.svg` usa el logo del sitio con un encuadre cuadrado para las pestañas del navegador.
- Debe adaptarse automáticamente al tema del navegador mediante `prefers-color-scheme`: negro en tema claro y blanco en tema oscuro, invirtiendo también el detalle interior.
- Conservar la geometría y la inclinación del logo compartido con `src/layouts/Base.astro` y `src/components/MobileGate.astro`.
- Al modificarlo, verificar su legibilidad en tamaños de 16, 32 y 64 píxeles sobre fondos claros y oscuros.

## Verificación

- `npm run build` genera el sitio estático y sus archivos comprimidos.
- `npm test` verifica el HTML generado y debe ejecutarse después del build cuando corresponda al cambio.

## Arquitectura y decisiones internas

### Cómo se renderiza

- **Astro, salida estática**: cada página (`/es/`, `/en/`, `/pt/` y sus tutoriales) se renderiza a HTML completo en el build. Título,
  meta, canonical, hreflang, Open Graph, JSON-LD (WebSite, WebApplication, FAQPage), H1, funciones, pasos, atajos y
  preguntas frecuentes están en el HTML que lee un crawler, sin ejecutar JavaScript.
- **El pentagrama vacío también se dibuja en el servidor** (`src/lib/staff.js`, mismo Verovio y mismo `ScoreModel`
  que el editor), así el primer render ya muestra una partitura. En el navegador, el editor lo reemplaza por el vivo.
- **Solo el editor corre en el cliente** (`src/client/`): Verovio dibuja el pentagrama, jsPDF exporta. React y
  Radix (toast y diálogo de confirmación) se cargan recién cuando hacen falta.

### Idioma: automático, sin selector

- **La URL es la fuente de verdad**: cada idioma vive en su propio prefijo (`/es/`, `/en/`, `/pt/`), con `canonical`
  propio y `hreflang` recíproco (también en el sitemap). Esas páginas nunca se redirigen, así que lo que indexa
  Google es lo que ve el usuario, y los enlaces compartidos conservan su idioma.
- **`/` es el `x-default`**: no tiene el editor. Elige el idioma según `navigator.languages` (primer idioma
  soportado, `en` si ninguno) con `location.replace`, y no redirige a bots. Sin JavaScript (o para un crawler)
  es una página con enlaces a los tres idiomas.
- Google muestra en los resultados la URL del idioma que corresponde a cada búsqueda (por `hreflang`), por eso el
  visitante orgánico casi nunca pasa por `/`.
- Si el hosting permite reglas en el borde, lo ideal es sumar un 302 de `/` según `Accept-Language` con
  `Vary: Accept-Language` (mismo criterio que el script); el script queda como respaldo.

### Estructura

- `src/pages/` — el editor (`/`, `/en/`, `/pt/`, con `EditorPage.astro`) y los tutoriales (`/tutoriales/`, `/en/tutorials/`, `/pt/tutoriais/`, con `TutorialsPage.astro`; un tema por página, definidos en `src/lib/tutorials.ts`).
- `src/layouts/Base.astro` — `<head>` SEO, header y footer.
- `src/i18n/` — textos es / en / pt.
- `src/client/` — el editor (`score-editor.js`, `score-model.js`, `score-fingering.js`).
- `src/styles/` — `global.css` (layout de la página) y `editor.css` (el editor).
- `src/vendor/ascii-tabs.js` — Vite lo empaqueta y minifica en un chunk que solo se pide al mostrar tablaturas.
- `public/vendor/` — `jspdf` (solo al exportar PDF); Verovio se minifica con source map y se versiona (`verovio-<versión>.js`, `scripts/vendor.mjs`); su WebAssembly (7 MB, embebido como string en el paquete npm) se extrae a `verovio-<versión>.wasm` y se compila en streaming, así no hay una tarea larga de parseo. En pantallas angostas (sin editor) solo se baja `main.js` (~1 KB); en desktop el JS y el `.wasm` se precargan con prioridad baja y se ejecutan al estar ocioso, o enseguida, con spinner, si hay partituras guardadas.
- `src/client/score-export.js` — importar/exportar (MusicXML, MIDI, PDF): chunk que se pide la primera vez que se usa el menú del sitio.

### Editor compartido

- Este repositorio también distribuye el editor que guitar-chords consume como dependencia de build desde GitHub, fijada a un commit. Ver `docs/shared-editor.md`.
- La lógica se mantiene en `src/client/`; `runtime.js` arranca el editor con opciones por sitio. Los controles de importar/exportar se conectan con `bindActions`; su ubicación, el HTML y los estilos pertenecen a cada sitio.
- `scripts/build-editor.mjs` compila el adaptador del consumidor y sus chunks y vendors locales. `scripts/build-package.mjs` genera los adaptadores CommonJS en `prepare`.
- Conservar los defaults propios: clave de sol y guardado con debounce aquí; clave de guitarra y guardado inmediato en guitar-chords. No sobrescribir claves explícitas de partituras guardadas.

### Ajustes (engranaje)

- Primera herramienta de la barra lateral. Instrumento (`score.instrument`: piano | guitarra) y tempo (`score.tempo`, negras por minuto, indicación metronómica en el primer compás y en el MIDI) viajan con la partitura y se deshacen. Guitarra fija la clave en sol con 8 y muestra TAB y cejilla; piano los oculta.
- Mostrar u ocultar los grupos de repetición, dinámica y voces es por partitura (`score.tools`, `M.setTool`), no global: viaja con el documento y la leyenda de voces se coloca a la izquierda de la llave.
- Con piano y los ajustes activos, cada renglón es un gran pentagrama (ver la sección siguiente). Cambiar a guitarra lo oculta sin borrarlo.

### Biblioteca de patrones

- **Activación**: casilla "Patrones" en los ajustes (sección Biblioteca); es del usuario, no de la partitura (`getSetting('patterns')`). La biblioteca vive en `localStorage` (`patternItems`, tope 60), no viaja en el documento. `startEditor({ patterns: true })` la ofrece; `.score-page.has-library` abre una columna a la izquierda del editor con `.score-library` ("PATRONES", vacía: "No hay patrones guardados").
- **Modelo** (`score-model.js`): un patrón es `{ events: [{ d, dot?, rest?, tp?, dn, mi, at }], first }`. `dn` es la distancia en pasos de escala a la primera nota con altura, así que no guarda tonalidad, alteraciones, ligaduras ni voces (se vuelven a inferir). `patternFrom` (figuras de un solo pentagrama), `patternFromMeasure`, `applyPattern` (sobre una copia de prueba; null si no entra), `cleanPattern` (valida lo guardado) y `patternDegrees` ("I V III II").
- **Guardar**: Shift+S guarda las figuras elegidas o, sin ninguna, el compás elegido con un click. No agrega duplicados.
- **Aplicar**: cada patrón tiene dos zonas arrastrables y clickeables. La izquierda (grados) conserva la relación entre notas y la primera queda en la altura donde se suelta; la derecha (figuras) usa solo el ritmo y todas las notas van a una misma altura. Arrastrar muestra un fantasma por figura (`patternGhost`). Un click, sin arrastrar, escribe el patrón en el compás elegido, desde su inicio y en la línea del medio.

### Acordes (guitarra)

- **Modelo**: `score.chords[mi]` es la lista, ordenada por `at`, de `{ at, name, variant? }` (un acorde por tiempo y compás; `variant` es la digitación elegida y 0 no se guarda). Mismo patrón que `barres`: está en `BY_MEASURE`, se parte con `setBarline`, `setMeter` quita los que ya no caben y `sanitize` descarta lo inválido. Una partitura con acordes se infiere de guitarra (`instrumentOf`).
- **Render**: `toMusicXml` escribe cada nombre como `<words font-weight="bold">` sobre el pentagrama de arriba, antes de la figura de su tiempo (si esa figura ya no existe se apoya en la anterior). Así lo dibuja Verovio y sale igual en PDF. Verovio no conserva el `id` de la dirección: el editor reconoce los nombres por la negrita y los empareja con `score.chords` por texto y orden (`mountChords`). No se importan al leer MusicXML.
- **Escribir**: con guitarra y sin herramienta activa, pasar el mouse a 3–7 espacios sobre la primera línea muestra un subrayado (`.score-chord-zone`) en la columna de la figura más cercana; un clic abre el campo (`.score-chord-draft`). El botón de la paleta (grupo de guitarra, `data-tool="chord"`) hace lo mismo al soltarlo sobre una nota. Enter o salir del campo guarda; Escape o vacío cancela.
- **Popup**: clic sobre un nombre (`.score-chord-trigger`) abre `#scoreChordPopup`, anclado a él: nombre editable, quitar, digitación y selectores de variante (que pasan por `change`, así se deshacen). Un nombre que no está en el diccionario queda escrito y el popup lo avisa.
- **Diccionario**: viene de `guitar-chords` (devDependency fijada a un commit de GitHub). `scripts/lib/chords-data.mjs` lo lee en el build y publica `public/vendor/chords-<hash>.json` (sin `notes`; en `.gitignore`); `__CHORDS_FILE__` lleva el nombre al editor, que lo pide la primera vez que se usa junto con `src/client/chords.js` (búsqueda por nombre o alias, variantes calculadas —cejilla de mi/la, dim7 movible, alternativas guardadas— y el diagrama SVG). Sin la dependencia el nombre queda vacío y no hay acordes.
- **Activación por sitio**: `startEditor({ chords: true })`. guitar-chords no lo activa porque los estilos (`editor.css`) son de cada sitio. Al actualizar la versión de `guitar-chords`, correr `npm install --save-dev github:libasoles/guitar-chords#<commit>`.

### Gran pentagrama (piano)

Solo existe con `instrumentOf(score) === 'piano'` y `createScoreModel({ grandStaff: true })`; `runtime.js` lo activa junto con `settings`, así que guitar-chords (un pentagrama, clave de guitarra, sin ajustes) no cambia. `M.stavesOf(score)` es la única fuente: 1 o 2.

- **Modelo**: el segundo pentagrama vive en `score.lower`, un mapa índice plano de compás → figuras (un compás sin figuras no tiene entrada). Es el mismo patrón que `barlines`, `keys` o `measureDurations`: se desplaza con `shiftKeys` al insertar, quitar, mover y dividir compases (lista `BY_MEASURE`). Se eligió un mapa paralelo y no cambiar la forma de los compases porque `rows` sigue siendo un arreglo de arreglos de figuras (los consumidores, el formato guardado y los tests no cambian): las partituras existentes y las de guitarra no tienen `lower`, y `sanitize` no lo agrega. `M.measures(score, 1)` abre los compases vacíos para editarlos; `pruneLower` los quita (lo hacen `sanitize`, `save` y `change`).
- **Referencias**: una figura es `{ mi, i }` arriba y `{ s: 1, mi, i }` abajo (`M.refOf`, `M.sameRef`, `M.staffOf`); en el SVG sus ids son `e<mi>-<i>` y `l<mi>-<i>`. `copySelection` pone lo de abajo en `lower` (o en `measures` con `staff: 1` si solo se eligió ese pentagrama); `pasteSelection` acepta `{ staff }`. Las acciones sobre una selección (tresillos, barras, ligaduras, acorde, voces) exigen un único pentagrama y compás.
- **Independiente por pentagrama**: figuras, silencios, voces (cada pentagrama infiere las suyas; nunca se fusionan voces entre ellos, ver `docs/voice-leading.md`), claves (`lowerClef` y `lowerClefs`, por defecto fa en cuarta; una clave guardada explícita no se sobrescribe) y el pentagrama que está bajo el cursor (`locate` elige el más cercano). Mover una figura al otro pentagrama le quita la voz guardada; no hay ligaduras entre pentagramas.
- **Compartido por el renglón**: compases y sus duraciones, armadura, métrica, barras (incluidas repeticiones y finales), D.C./D.S./segno, casas 1./2., reguladores y dinámicas, anchos de compás y tempo. Justificación: en una partitura de piano los dos pentagramas son la misma sucesión de compases (cada compás dura lo mismo en ambas manos y las barras los atraviesan); la armadura y la métrica son del pasaje, no de la mano; las repeticiones, saltos y dinámicas indican qué se toca de nuevo y cómo, para las dos manos. Compartirlos evita estados que no se pueden escribir (una mano con un compás más que la otra) y mantiene una sola implementación de cada operación sobre compases. Lo que sí cambia entre manos es la clave, y es lo único que se duplica. Las dinámicas y reguladores se escriben bajo el pentagrama de arriba, que en piano es entre los dos.
- **MusicXML**: una sola parte con `<staves>2</staves>`, una `<clef number>` por pentagrama, `<staff>` en cada nota y `<backup>` para escribir el segundo tras el primero. Las voces del segundo van desde `MAX_VOICE + 1`. Verovio dibuja la llave. Con un pentagrama la salida es idéntica a la anterior. Al importar, `<staff>2</staff>` va a `lower`; un sitio de un pentagrama (guitar-chords) vuelca todo al primero, como antes. De varias partes solo se lee la primera.
- **MIDI**: cada pentagrama suena en su canal (0 y 1) y el piano usa el programa 0 (la guitarra, 24); se escribe `score.tempo`. Al leer, si el archivo trae dos partes (pista y canal) la más aguda va arriba; si no, se corta en el do central; se lee el tempo. `n` ya es la altura que escribe el MusicXML, así que el MIDI no suma la octava de la clave (antes quedaba una octava más alto con clave de sol; con clave de guitarra no cambia).
- **Editor**: `layout[mi]` guarda las líneas de cada pentagrama (`staves`) y la extensión del renglón (`top`/`bottom`); las barras, el compás elegido, el arrastre de compases y los marcadores de repetición usan el renglón entero, y las notas, el pentagrama que les toca. La barra lateral sigue alineada con el primer pentagrama. Un control de clave por pentagrama (el popup dice cuál); la armadura tiene un control por compás. Una barra cambia la clave del pentagrama según la mitad donde se hizo clic. Cambiar una clave fija el instrumento que se infería, para que no cambie el número de pentagramas.
- **Voces (coloración)**: con "Voces" activo se colorean los dos pentagramas; cada uno infiere sus voces y el número de voz da el mismo color de la leyenda 1–4 en ambos. La leyenda elige qué voces se colorean (`is-voice-on`); sin ninguna elegida no hay color, y nunca se oculta una figura. Una línea puede pasar de una mano a otra en el piano (notación entre pentagramas; en Dorico la nota conserva el color de su pentagrama de origen), pero el modelo no lo representa: mover una figura al otro pentagrama le quita la voz y se vuelve a inferir allí.
- **Render de servidor y altura**: `renderEmptyStaff(…, { grandStaff: true })` dibuja los tres renglones con dos pentagramas, y `.score-stage[aria-busy]` reserva 53,1 rem (antes 33) para que al hidratar no haya salto de layout. `.score-palette` no cambia: su alto depende de las herramientas, no de los pentagramas. Una partitura de guitarra guardada pasa de 53 a 33 rem al cargar.

### Compresión y caché

`npm run build` deja junto a cada archivo de texto de `dist/` su `.br` y `.gz` (`scripts/compress.mjs`). El servidor debe enviarlos tal cual
(nginx: `gzip_static on` / `brotli_static on`) y cachear `/_astro/*` y `/vendor/*` como `immutable` (nombres con hash o versión);
`public/_headers` lo declara para Netlify / Cloudflare Pages. `npm run serve` levanta `dist/` así, para medir con Lighthouse (`node scripts/lighthouse.mjs http://localhost:4323`).
No es una PWA: no hay manifest ni service worker.
- `public/og-{es,en,pt}.png` (`npm run og`), `apple-touch-icon.png`  — generados con el editor real (ejercicio cargado) y `favicon.svg`.

### Guardado local

- **Partituras → IndexedDB** (`src/client/storage.js`): base `partitura`, store `workspace`, registro `tabs` con
  `{ active, scores }`. Sin el tope de ~5 MB de localStorage y sin bloquear la UI. El editor lee las partituras de
  forma síncrona, así que `main.js` las carga antes de arrancarlo (`window.ScoreStore.stored`); los cambios se
  escriben con un debounce de 300 ms y se vuelcan al ocultar la página (`pagehide` / `visibilitychange`).
- **Opciones (settings) → localStorage** (`src/client/settings.js`): `getSetting(nombre, porDefecto)` y
  `setSetting(nombre, valor)`, todas bajo la clave `partitura.settings.v1`. Solo para datos pequeños; nunca partituras.
- **Migración**: si IndexedDB está vacío y existe `scoreEditor.tabs.v1` en localStorage, se copia a IndexedDB y se
  borra esa clave. Las claves antiguas de una sola partitura (`scoreEditor.v1` / `v2`) se siguen leyendo una vez.
- **Respaldo**: si IndexedDB no está disponible (modo privado, bloqueado), las partituras vuelven a guardarse en
  localStorage.
- Ninguno es una copia de seguridad: limpiar los datos del sitio borra todo.

### Voces y conducción

- Fundamentación, fuentes, reglas y límites: `docs/voice-leading.md`.
- No inferir una única voz porque dos notas coincidan en inicio y duración. Conservar la continuidad de las líneas y las voces explícitas, incluidos cruces de registro.
- Formar un acorde de notación es una decisión explícita; no equivale a analizar las voces contrapuntísticas del acorde.
- Recalcular voces no debe fusionarlas para hacerlas caber ni cambiar los inicios o las duraciones. Verificar homorritmia, cruces, independencia del bajo y persistencia.

## Pendiente

- Páginas de contenido adicionales (guías, ejemplos) para ampliar el posicionamiento.
- Astro está fijado en la 6.x porque la 7 pide Node >= 22.23.4.
