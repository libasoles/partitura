// Una letra pegada se divide en silabas: [{ text }]; los guiones unen dos silabas en una nota (ligadura).
// El silabeo (`hyphenateWord`, `splitIntoWords`) es de el-silbador y llega por parametro: el editor lo pide al pegar.
const DASHES = /[-‐-―]/;

export function lyricSyllables(text, { hyphenateWord = (word) => [word], splitIntoWords = (line) => line.split(/\s+/).filter(Boolean) } = {}) {
  const syllables = [];
  splitIntoWords(text).forEach((word) => {
    // Un guion escrito une las silabas de ambos lados en una sola nota ("do-en" -> "do en"): se dibuja como ligadura de silabas.
    // Cada parte se silabea por su cuenta; un guion suelto se ignora.
    const parts = word.split(DASHES).filter((part) => /\p{L}|\p{N}/u.test(part));
    parts.forEach((part, k) => {
      const pieces = hyphenateWord(part);
      if (k > 0 && syllables.length) syllables[syllables.length - 1].text += ' ' + pieces[0];
      else syllables.push({ text: pieces[0] });
      pieces.slice(1).forEach((piece) => syllables.push({ text: piece }));
    });
  });
  return syllables;
}
