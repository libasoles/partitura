# Desarrollo

Información para quien trabaja en el código (personas y agentes). El README público no la incluye.

## Stack

[Astro](https://astro.build) (salida estática) · [Verovio](https://www.verovio.org) (engraving, WebAssembly) · jsPDF (PDF) · React + Radix UI (toasts y diálogos).

Disponible en español, inglés y portugués, y renderizado en el servidor para que todo el contenido sea indexable. El detalle de la arquitectura está en `AGENTS.md`.

## Empezar

Requiere Node >= 22.12 (ver `.nvmrc`).

```sh
npm install
npm run dev
```

```sh
npm run build   # sitio estático en dist/; SITE_URL=https://ejemplo.com para el dominio de canonical, hreflang y sitemap
npm test        # después del build: verifica el HTML generado
npm run check   # astro check (tipos)
```

Las pruebas de navegador generan el sitio estático y lo verifican con Chromium de Playwright y un perfil aislado:

```sh
npx playwright install chromium   # una vez por equipo
npm run test:browser              # inicia su propio servidor de prueba
```

## Reutilizar el editor

El editor también se consume durante el build de guitar-chords, desde una revisión fija de este repositorio. Ver [la integración y actualización de la dependencia](shared-editor.md).

## Capturas del README

`docs/editor.png` y `docs/ajustes.png` se generan con Playwright a 1440×1100 (factor 2) sobre `/es/demos/canto-en-la-rama/?tools=voices,play,intervals&sound=uh&banner=hide`, con Repetición y Dinámica activadas en Ajustes, las voces 1–3 elegidas en la leyenda e Intervalos activado. La biblioteca de patrones queda apagada. La segunda captura tiene el panel de Ajustes abierto.
