# FluidR3 instrument samples

Piano (`acoustic_grand_piano`), nylon guitar (`acoustic_guitar_nylon`) and choir (`choir_aahs`, `voice_oohs` as `choir-ah`, `choir-oh`; Na, La and Uh reuse `choir-ah`, and Mm reuses `choir-oh`, with low-pass filtering (see score-playback.js)) samples
from FluidR3 by Frank Wen, rendered as MP3 by Benjamin Gleitzman / MIDI.js Soundfonts.

Source: https://github.com/gleitz/midi-js-soundfonts/tree/gh-pages/FluidR3_GM
License: Creative Commons Attribution 3.0 (CC BY 3.0)
https://creativecommons.org/licenses/by/3.0/

`choir-chorale` is the Voice Oohs render served by Klang Studio's soundfont CDN (`cdn.klang.io/soundfonts/voice_oohs-mp3.js`), the same FluidR3 instrument mixed differently.

Modification: the original MIDI.js JavaScript assignments were converted to JSON;
the embedded MP3 data is unchanged. No samples are downloaded until Play is pressed.
