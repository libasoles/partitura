const midiTypes = ['audio/midi', 'audio/x-midi', 'audio/mid', 'audio/sp-midi'];
const xmlTypes = ['application/vnd.recordare.musicxml+xml', 'application/xml', 'text/xml'];
export const scoreFileAccept = ['.musicxml', '.xml', '.mid', '.midi', ...midiTypes, ...xmlTypes].join(',');

export function isMidiFile(file) {
  return /\.midi?$/i.test(file.name || '') || midiTypes.includes(file.type?.toLowerCase());
}

export function acceptsScoreFile(file) {
  // During an OS drag the browser often exposes only the MIME type, until drop.
  if (file.name) return /\.(musicxml|xml|mid|midi)$/i.test(file.name);
  // Many systems register no MIME type for .musicxml: an empty one is unknown, so the extension decides on drop.
  const type = file.type?.toLowerCase();
  return !type || [...midiTypes, ...xmlTypes].includes(type);
}
