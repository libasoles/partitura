const midiTypes = ['audio/midi', 'audio/x-midi', 'audio/mid', 'audio/sp-midi'];
const xmlTypes = ['application/vnd.recordare.musicxml+xml', 'application/xml', 'text/xml'];
export const scoreFileAccept = ['.musicxml', '.xml', '.mid', '.midi', ...midiTypes, ...xmlTypes].join(',');

export function isMidiFile(file) {
  return /\.midi?$/i.test(file.name || '') || midiTypes.includes(file.type?.toLowerCase());
}

export function acceptsScoreFile(file) {
  // During an OS drag the browser often exposes only the MIME type, until drop.
  if (file.name) return /\.(musicxml|xml|mid|midi)$/i.test(file.name);
  return [...midiTypes, ...xmlTypes].includes(file.type?.toLowerCase());
}
