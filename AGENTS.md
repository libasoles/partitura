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
