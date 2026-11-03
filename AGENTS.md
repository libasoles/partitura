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
