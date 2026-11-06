// Format prose only: existing keycaps, SVG animations and attributes stay intact.
export function highlightTutorialKeys(html) {
  return html.replace(/<svg\b[\s\S]*?<\/svg>|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>|<kbd\b[\s\S]*?<\/kbd>|<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>|<[^>]*>|[^<]+/g, part => {
    if (part.startsWith('<')) return part;
    // Mark bare letter keys only in a shortcut or after an explicit keyboard instruction.
    part = part.replace(/([+/]\s*)([A-Z0-9])\b/g, '$1<kbd>$2</kbd>')
      .replace(/((?:Apretá|apretá|presioná|Presioná|Press|press|Pressione|pressione|tecla|key)\s+)([A-Z0-9])\b/g, '$1<kbd>$2</kbd>');
    return part.replace(/\b(?:Ctrl|Cmd|Mayús|Shift|Alt|Option|Enter|Delete|Retroceso|Backspace|Escape|Esc|Tab|Spacebar|Space)\b|barra espaciadora|space bar|barra de espaço|flecha arriba|flecha abajo|[↑↓←→]/g, '<kbd>$&</kbd>');
  });
}
