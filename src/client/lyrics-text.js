// Una letra pegada se divide en silabas: [{ text, hy }], donde `hy` marca que la palabra sigue en la silaba siguiente.
// El silabeo (`hyphenateWord`, `splitIntoWords`) es de el-silbador y llega por parametro: el editor lo pide al pegar.
const DASHES = /[-‐-―]/;

export function lyricSyllables(text, { hyphenateWord = (word) => [word], splitIntoWords = (line) => line.split(/\s+/).filter(Boolean) } = {}) {
  const syllables = [];
  splitIntoWords(text).forEach((word) => {
    // Los guiones escritos ya dividen la palabra ("glo-ria"); cada parte se silabea por su cuenta.
    const parts = word.split(DASHES).filter((part) => /\p{L}|\p{N}/u.test(part));
    const pieces = parts.flatMap((part) => hyphenateWord(part));
    pieces.forEach((piece, i) => syllables.push({ text: piece, hy: i < pieces.length - 1 }));
  });
  return syllables;
}
