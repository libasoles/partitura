# Partitura

Editor de partituras online, gratis y sin registro. Una página en blanco donde escribir notas, silencios, compases,
clave y armadura, con tablatura de guitarra, y descargar el resultado en PDF o MusicXML.

Disponible en español, inglés y portugués, y renderizado en el servidor para que todo el contenido sea indexable.

## Características

- **Notas y silencios** de redonda a fusa, con puntillo y alteraciones (sostenido, bemol, becuadro).
- **Compases** (4/4, 3/4, 6/8…) con control de duración: no deja pasarse del compás.
- **Clave y armadura**: Sol, Fa o Do, y cualquier armadura de Do♭ a Do♯.
- **Barras especiales**: doble, de repetición y cejillas para guitarra.
- **Tablatura de guitarra** editable: cambiar el traste, mover una celda de cuerda o de tiempo, y recolocar la digitación sin alterar el sonido.
- **Atajos de teclado** para cada figura, duplicar selección y más.
- **Varias partituras en pestañas** con guardado automático en el navegador (IndexedDB).
- **Exportación** a PDF para imprimir y a MusicXML para abrir en MuseScore, Finale, Sibelius o Dorico.
- **Tutoriales** por tema, en tres idiomas.

## Stack

[Astro](https://astro.build) (salida estática) · [Verovio](https://www.verovio.org) (engraving, WebAssembly) ·
jsPDF (PDF) · React + Radix UI (toasts y diálogos, carga diferida).

## Empezar

```sh
npm install
npm run dev
```

Requiere Node >= 22.12 (ver `.nvmrc`).

```sh
SITE_URL=https://tu-dominio.com npm run build   # canonical, hreflang, sitemap y robots salen de SITE_URL
npm test                                        # después del build: verifica el HTML renderizado
npm run check                                   # astro check (tipos)
```

## Cómo se renderiza

- **Astro, salida estática**: cada página (`/es/`, `/en/`, `/pt/` y sus tutoriales) se renderiza a HTML completo en el build. Título,
  meta, canonical, hreflang, Open Graph, JSON-LD (WebSite, WebApplication, FAQPage), H1, funciones, pasos, atajos y
  preguntas frecuentes están en el HTML que lee un crawler, sin ejecutar JavaScript.
- **El pentagrama vacío también se dibuja en el servidor** (`src/lib/staff.js`, mismo Verovio y mismo `ScoreModel`
  que el editor), así el primer render ya muestra una partitura. En el navegador, el editor lo reemplaza por el vivo.
- **Solo el editor corre en el cliente** (`src/client/`): Verovio dibuja el pentagrama, jsPDF exporta. React y
  Radix (toast y diálogo de confirmación) se cargan recién cuando hacen falta.

## Uso

```sh
npm install
npm run dev
SITE_URL=https://tu-dominio.com npm run build   # canonical, hreflang, sitemap y robots salen de SITE_URL
npm test                                        # después del build: verifica el HTML renderizado
```

Requiere Node >= 22.12. Astro está fijado en la 6.x porque la 7 pide Node >= 22.23.4.

## Idioma: automático, sin selector

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

## Estructura

- `src/pages/` — el editor (`/`, `/en/`, `/pt/`, con `EditorPage.astro`) y los tutoriales (`/tutoriales/`, `/en/tutorials/`, `/pt/tutoriais/`, con `TutorialsPage.astro`; un tema por página, definidos en `src/lib/tutorials.ts`).
- `src/layouts/Base.astro` — `<head>` SEO, header y footer.
- `src/i18n/` — textos es / en / pt.
- `src/client/` — el editor (`score-editor.js`, `score-model.js`, `score-fingering.js`).
- `src/styles/` — `global.css` (layout de la página) y `editor.css` (el editor).
- `public/vendor/` — `ascii-tabs.js` y `jspdf`; Verovio se copia desde `node_modules` (`scripts/vendor.mjs`).

## Guardado local

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

## Pendiente

- Imagen Open Graph (`og:image`) y dominio definitivo.
- Páginas de contenido adicionales (guías, ejemplos) para ampliar el posicionamiento.
