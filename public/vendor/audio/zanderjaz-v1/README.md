# Zanderjaz choir archive — audition collection

Five selected SF2 downloads (Aahhs, Korg aahhs, Mellotron choir, Phil’s voice solo, Soft voice) from https://www.zanderjaz.com/downloads/soundfonts/choirs/
Retrieved 2026-11-06. Original binary files, renamed only; original URLs and
selected preset indices are recorded in src/client/choir-sounds.js.

Zanderjaz is the archivist, not the creator. Authorship and license information
vary between fonts; preserve the embedded SF2 INFO chunks. The archive does not
guarantee redistribution/commercial usage rights. Review each chosen font's
embedded credits and terms before retaining it for a public product.

The editor plays the PCM zones with their key ranges, tuning, layering, pan,
attenuation, low-pass cutoff and sustain loops through Web Audio. It uses a
shared choir attack/release; SF2 modulators, chorus/reverb and LFOs are not emulated.
This is a sampler for comparing timbres, not a complete SoundFont synthesizer.

Where there are several presets, the catalog selects a plain voice/choir preset
rather than a major/minor chord, synth or filter-sweep patch.

Only the selected font is fetched when Play is pressed. The SF2 is cached for the
editor session, and PCM buffers are created only for samples used by the score.
Custom timbres are saved with the score; MIDI export uses the general choir
program and does not embed the SF2.
