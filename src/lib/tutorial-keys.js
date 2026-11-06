// Format prose only: existing keycaps, SVG animations and attributes stay intact.
export function highlightTutorialKeys(html) {
  return html.replace(/<svg\b[\s\S]*?<\/svg>|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>|<kbd\b[\s\S]*?<\/kbd>|<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>|<[^>]*>|[^<]+/g, part => {
    if (part.startsWith('<')) return part;
    // Mark bare letter keys only in a shortcut or after an explicit keyboard instruction.
    part = part.replace(/([+/]\s*)([A-Z0-9])\b/g, '$1<kbd>$2</kbd>')
      .replace(/((?:Apretá|apretá|presioná|Presioná|Press|press|Pressione|pressione|tecla|key)\s+)([A-Z0-9])\b/g, '$1<kbd>$2</kbd>');
    return part.replace(/\b(?:Ctrl|Cmd|Mayús|Shift|Alt|Option|Enter|Delete|Retroceso|Backspace|Escape|Esc|Tab|Spacebar|Space)\b|barra espaciadora|space bar|barra de espaço|flecha arriba|flecha abajo|(?:(?<=[+/]\s*)|(?<=(?:flechas?|teclas?|keys?|arrows?|setas?)\s))[↑↓←→]|[↑↓←→](?=\s*\/)/g, '<kbd>$&</kbd>');
  });
}

// Names the reader has to recognise on screen (tunings, file formats, navigation marks) get the same highlight as the
// editor's own labels (<em>). The first tuning of a list is found by what follows it.
const TERMS = /\b(?:Double Drop D|Drop D|DADGAD|Open D|Open G|MusicXML|MIDI|PDF|D\.C\.|D\.S\.)(?![\w])|\b(?:Estándar|Standard|Padrão)(?=,\s*Drop D)/g;

export function highlightTutorialTerms(html) {
  return html.replace(/<svg\b[\s\S]*?<\/svg>|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>|<kbd\b[\s\S]*?<\/kbd>|<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>|<[^>]*>|[^<]+/g, part =>
    part.startsWith('<') ? part : part.replace(TERMS, '<span class="tutorial-term">$&</span>'));
}
