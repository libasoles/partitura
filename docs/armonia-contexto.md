# Elegir un nombre de acorde por columna usando el contexto armónico

`chordNames(notes)` (`src/client/chord-names.js`) devuelve todos los nombres posibles de UNA columna. Este documento describe cómo
elegir uno por columna mirando la secuencia completa y dejar el resto como alternativas (tooltip). El algoritmo propuesto
se probó en un prototipo de ~58 líneas (fuera del repositorio) con los ejemplos de abajo.

## Resumen del método

1. **Tonalidad global** (tónica + modo): se suma, para cada una de las 24 tonalidades, el producto escalar entre el histograma de clases de
   altura de las columnas y un perfil de tonalidad, más un sesgo por el último y el primer bajo y un prior por la armadura.
2. **Puntaje unario** de cada candidato dado el tono: grado diatónico, notas fuera de escala, dominante secundaria, forma del acorde
   (prior intrínseco) y penalización por inversión.
3. **Puntaje de transición** entre candidatos de columnas consecutivas: movimiento de raíz, función (T/S/D), notas comunes,
   acorde sostenido, sensible del dim7.
4. **Viterbi**: se maximiza la suma de unarios y transiciones sobre todo el camino. El ganador de cada columna es el nombre
   mostrado; los demás candidatos quedan como `alts`.

## Qué dicen las fuentes y qué se tomó de cada una

Solo se cita lo que se pudo comprobar en las páginas consultadas; los pesos numéricos son decisión nuestra (ver «Límites»).

| Heurística | Fuente | Qué se tomó |
|---|---|---|
| Perfiles de tonalidad (sondeo de tonos) y correlación con el histograma de alturas | Krumhansl–Schmuckler; resumen en [Heaps' Law and Vocabulary Richness… (arXiv 2104.04143)](https://arxiv.org/pdf/2104.04143), que reproduce los perfiles | Perfil mayor `6.35 2.23 3.48 2.33 4.38 4.09 2.52 5.19 2.39 3.66 2.29 2.88`; menor `6.33 2.68 3.52 5.38 2.60 3.53 2.54 4.75 3.98 2.69 3.34 3.17` (desde la tónica, cromático). Gana la tonalidad con mayor correlación de Pearson sobre las 12 rotaciones. |
| Perfiles corregidos y producto escalar en vez de correlación | Temperley, [«What's Key for Key?» (1999, Music Perception 17(1))](https://bibbase.org/network/publication/temperley-whatskeyforkeythekrumhanslschmucklerkeyfindingalgorithmreconsidered-1999); [Essentia `Key`](https://essentia.upf.edu/reference/std_Key.html) lo cita como origen de sus perfiles | Se comprobó que propone perfiles modificados y un producto escalar simple. Los valores usados abajo (`5 2 3.5 2 4.5 4 2 4.5 2 3.5 1.5 4` mayor; `5 2 3.5 4.5 2 4 2 4.5 3.5 2 1.5 4` menor) son de memoria del autor del documento y **no se verificaron** en una fuente consultada: confirmarlos contra el artículo. |
| Reglas de preferencia para raíces: compatibilidad de las alturas con la raíz; raíces cercanas en la línea de quintas; cambios en tiempos fuertes; disonancias ornamentales | [The Temperley–Sleator Harmonic Analyzer (CMU)](https://www.cs.cmu.edu/~sleator/harmonic-analysis) | Estructura «unario (compatibilidad) + transición (cercanía de raíces en la línea de quintas)». La página no da pesos numéricos ni dice qué método de búsqueda usa. |
| Análisis armónico como segmentación óptima resuelta con programación dinámica | Choi (2011), [Jazz Harmonic Analysis as Optimal Tonality Segmentation](https://docdrop.org/download_annotation_doc/Choi---2011---Jazz-Harmonic-Analysis-as-Optimal-Tonality-Seg-yxffc.pdf) (solo vista en los resultados de búsqueda, no leída completa) | Justifica formular la elección como DP. |
| Análisis en dos pasos (segmentar y etiquetar), pesos fijados a mano | Pardo y Birmingham (2002), *Algorithms for Chordal Analysis*, Computer Music Journal 26(2); reseña en [Leonardo Reviews](https://leonardo.info/reviews_archive/jan2003/COMPUTER_ryssen.html), y [Chord Recognition in Symbolic Music (arXiv 1810.10002)](https://arxiv.org/pdf/1810.10002) que clasifica a HarmAn y Melisma como de parámetros predefinidos | Respalda usar pesos manuales en lugar de entrenar. El artículo original no se leyó. |
| Función armónica T → S (predominante) → D → T; D → S es una «retrogresión» que se evita | [Open Music Theory, Harmonic Functions (LibreTexts)](https://human.libretexts.org/Bookshelves/Music/Open_Music_Theory_1e/03:_Harmony/3.02:_Harmonic_Functions); retrogresión según [Western Harmonic Practice I (RWU)](https://rwu.pressbooks.pub/musictheory/chapter/harmonic-direction-i-root-motion-and-progression/) y [Unit 4 overview](https://knowt.com/note/a38b8a23-f077-4a62-9568-ed2aa9a50a04/Unit-4-Overview-Functional-Harmony-and-) | Tabla de bonos S→D, D→T y castigo D→S. Los grados con función T: 1, 3, 5, 6, 7 según OMT (aquí se usa I, iii, vi como T; vii se trata como D). |
| Movimiento de raíz fuerte / débil / adyacente | Ídem RWU (resumen de búsqueda: «strong» = quinta, «weak» = tercera, «adjacent» = segunda) | Quinta/cuarta es el movimiento más favorecido; terceras y segundas, menos; segunda menor y tritono, penalizados. |
| ii–V–I como bloque central, hallable en cadencias | [Open Music Theory 2e, ii–V–I](https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/06:_Jazz/6.04:_iiVI) | Respalda S→D→T con raíces descendiendo por quintas. |
| «Una función se define por su relación con la tónica» | Artículo de [Harmonic Vectors (MTO)](https://mtosmt.org/ojs/index.php/mto/article/view/246/12), según el resumen de búsqueda | Respalda estimar primero la tónica y luego los grados. |
| Preferir menos cambios de tonalidad / penalización por cambiar | Preprint [arXiv 2606.03459](https://arxiv.org/html/2606.03459) (resumen de búsqueda) | Por eso se estima UNA tonalidad global; la local queda como extensión. |

## 1. Estimar la tonalidad

Puntaje de la tonalidad `(t, modo)`:

```
S = Σ_pc hist[pc] · perfil_modo[(pc − t) mod 12] / nColumnas
  + W.tonic · ([bajo de la última columna = t] + 0,5 · [bajo de la primera = t])
  + W.sig   · [t = tónica que implica la armadura (fifths)]
```

- `hist[pc]` cuenta en cuántas columnas suena la clase de altura (no se pondera por duración en el prototipo; ponderar por duración es la mejora obvia).
- Sesgo por final y comienzo: una frase tonal suele empezar y terminar en la tónica (sesgo de tónica de Krumhansl y de los sistemas de cadencias). Se usa el bajo de la
  PRIMERA candidata de la columna (la raíz en posición fundamental del orden de `chordNames`).
- Armadura: la partitura ya trae `keys`/armadura por compás; sirve de prior (+0,8), no de verdad (una pieza en La menor sin accidentales vs
  Do mayor: la armadura empata, decide el final). Las alteraciones accidentales aparecen solas en el histograma (el sol# empuja a La menor).
- Menor: la escala diatónica es la natural más la sensible (7ª elevada). 6ª elevada y 7ª natural se admiten sin penalización solo si
  el acorde lo exige; en el prototipo la 6ª elevada cuenta como fuera de escala.

## 2. Puntaje unario de un candidato

Para el candidato `c` con raíz `r`, grado `d = (r − t) mod 12`:

```
U(c) = DEG[modo][d]                      // prior del grado
     − W.oos · (#notas fuera de la escala)   // cromático/raro
     + W.sec · 2   si es X7, con una sola nota fuera de escala y su quinta cae en la escala, d ≠ 0   // dominante secundaria
     + FORMA[sufijo]                      // prior intrínseco de la forma
     − W.inv (+ W.inv2 si es triada en 2ª inversión) si bajo ≠ raíz
```

Las dim7 no usan `DEG` (simétricas: cualquier raíz es igual de «grado»; ver transición).

## 3. Tabla de pesos

| Nombre | Valor | Efecto |
|---|---|---|
| `DEG` mayor | I 1, V 0,9, IV 0,7, ii 0,6, vi 0,6, iii 0,3, vii 0,2 | frecuencia/estabilidad funcional del grado |
| `DEG` menor | i 1, V 0,8 (mayor, con sensible), iv 0,6, VI 0,4, III 0,3, VII 0,3, ii° 0,2, resto 0,2 | ídem |
| `W.oos` | 2 por nota | descarta lecturas cromáticas si hay una diatónica |
| `W.sec` | 1 (bono 2) | V7/x se admite pese a su nota alterada |
| `W.inv` | 1,2 | raíz en bajo > inversión |
| `W.inv2` | 0,3 extra | triada en 2ª inversión, la más débil |
| `W.tonic` | 1,5 | bajo final = tónica (la mitad en el comienzo) |
| `W.sig` | 0,8 | armadura como prior |
| `W.sixth` | 1,5 | séptima (m7) sobre el VI grado en modo mayor (Am7/C) gana a la sexta con las mismas notas (C6); regla pedida por el usuario, añadida tras el prototipo |
| `W.held` | 0,8 | mismo nombre que la columna anterior (acorde sostenido) |
| `FORMA` | triada 0, 7/m7 −0,1, maj7 −0,2, m7b5/dim −0,3, 6 −0,6, m6/dim7 −0,8, aug −1, sus/m(maj7) −1,2 | prior intrínseco |
| Raíz (desde → hacia, mod 12) | +5 (sube 4ª, cae 5ª) 1; +7 0,5; 0 0,5; ±2 0,3 (+2) / 0,2 (−2); terceras (3, 4, 8, 9) 0,3; 1, 6, 11 −0,5 | movimiento de raíz |
| Función T0/S1/D2 | S→D +0,6; D→T +0,8; T→S +0,3; D→S −0,5 | sintaxis funcional |
| Notas comunes | +0,15 por nota (máx. 3) | continuidad de voces |
| dim7 → raíz+1 | +1,2 | dim7 como sensible del siguiente acorde |

Mayor: funciones I,iii,vi = T; ii,IV = S; V,vii = D. Menor: i,III = T; ii°,iv,VI = S; V,VII,vii° = D.

## 4. Formulación Viterbi

Columnas `1..N`, cada una con candidatos `C_i`. Se busca el camino `c_1..c_N` que maximiza

```
Σ_i U(c_i) + Σ_{i>1} T(c_{i−1}, c_i)
```

Recurrencia: `best[i][j] = U(c_ij) + max_k ( best[i−1][k] + T(c_{i−1,k}, c_ij) )`, con puntero atrás. Coste `O(N · K²)`, con `K` ≈ 2–6
candidatos. Columna sin candidatos (menos de 3 notas): se corta la secuencia en segmentos y se corre Viterbi por separado (la transición no
tiene sentido a través de un silencio o un intervalo). Desempates: a igual puntaje gana el primer candidato en el orden de `chordNames`
(raíz en bajo, luego orden de `SHAPES`).

## 5. Implementación de referencia (probada)

Entrada: `columns = [{ names, pcs }]` (`names` en el orden de `chordNames`, `pcs` las clases de altura), `fifths` de la armadura.
Salida: `{ key, chords: [{ name, alts }] }`. Parsea el nombre (`Raíz + sufijo + /bajo`) y reconstruye las notas con la tabla de formas.

```js
const SH = { '':[0,4,7], m:[0,3,7], dim:[0,3,6], aug:[0,4,8], 7:[0,4,7,10], maj7:[0,4,7,11], m7:[0,3,7,10],
  m7b5:[0,3,6,10], dim7:[0,3,6,9], 'm(maj7)':[0,3,7,11], 6:[0,4,7,9], m6:[0,3,7,9], sus4:[0,5,7], sus2:[0,2,7] };
const SHAPE = { '':0, m:0, 7:-0.1, m7:-0.1, maj7:-0.2, m7b5:-0.3, dim:-0.3, 6:-0.6, m6:-0.8, dim7:-0.8, aug:-1, 'm(maj7)':-1.2, sus4:-1.2, sus2:-1.2 };
const MAJ = [5,2,3.5,2,4.5,4,2,4.5,2,3.5,1.5,4], MIN = [5,2,3.5,4.5,2,4,2,4.5,3.5,2,1.5,4]; // Temperley (verificar)
const SCALE = { maj: [0,2,4,5,7,9,11], min: [0,2,3,5,7,8,10] };
const DEG = { maj: {0:1,2:.6,4:.3,5:.7,7:.9,9:.6,11:.2}, min: {0:1,2:.2,3:.3,5:.6,7:.8,8:.4,10:.3,11:.2} };
const FUNC = { maj:{0:0,2:1,4:0,5:1,7:2,9:0,11:2}, min:{0:0,2:1,3:0,5:1,7:2,8:1,10:2,11:2} };
const PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
const parse = (name) => { const m = /^([A-G])(#|b|bb|##)?(.*?)(?:\/([A-G])(#|b|bb|##)?)?$/.exec(name);
  const pc = (l, a) => (PC[l] + ({ '#':1, b:-1, bb:-2, '##':2 }[a] || 0) + 12) % 12;
  const root = pc(m[1], m[2]);
  return { name, root, suffix: m[3], bass: m[4] ? pc(m[4], m[5]) : root, pcs: SH[m[3]].map((s) => (root + s) % 12) }; };

export function pickChords(columns, { fifths = 0, W = {} } = {}) {
  const w = { tonic: 1.5, sig: 0.8, oos: 2, inv: 1.2, inv2: 0.3, sec: 1, held: 0.8, ...W };
  const cols = columns.map((c) => c.names.map(parse));
  const hist = Array(12).fill(0); columns.forEach((c) => c.pcs.forEach((p) => hist[p]++));
  const first = cols[0][0], last = cols.at(-1)[0];
  let key = null;
  for (let t = 0; t < 12; t++) for (const mode of ['maj', 'min']) {
    const prof = mode === 'maj' ? MAJ : MIN;
    let s = hist.reduce((a, h, p) => a + h * prof[(p - t + 12) % 12], 0) / Math.max(1, columns.length);
    s += w.tonic * ((last.bass === t ? 1 : 0) + (first.bass === t ? 0.5 : 0));
    const sigTonic = mode === 'maj' ? (fifths * 7 + 120) % 12 : (fifths * 7 + 9 + 120) % 12;
    if (t === sigTonic) s += w.sig;
    if (!key || s > key.s) key = { t, mode, s };
  }
  const inScale = (p) => SCALE[key.mode].includes((p - key.t + 12) % 12) || (key.mode === 'min' && (p - key.t + 12) % 12 === 11);
  const unary = (c) => {
    const d = (c.root - key.t + 12) % 12; let s = c.suffix === 'dim7' ? 0 : DEG[key.mode][d] ?? 0;
    const out = c.pcs.filter((p) => !inScale(p)).length;
    s -= w.oos * out;
    if (out === 1 && c.suffix === '7' && inScale((c.root + 7) % 12) && d !== 0) s += w.sec * 2;
    s += SHAPE[c.suffix];
    if (c.bass !== c.root) s -= w.inv + (c.pcs.length === 3 && c.bass === c.pcs[2] ? w.inv2 : 0);
    return s;
  };
  const fn = (c) => FUNC[key.mode][(c.root - key.t + 12) % 12];
  const trans = (a, b) => {
    if (a.name === b.name) return w.held;
    const iv = (b.root - a.root + 12) % 12;
    let s = { 5: 1, 7: 0.5, 0: 0.5, 2: 0.3, 3: 0.3, 4: 0.3, 8: 0.3, 9: 0.3, 10: 0.2, 1: -0.5, 6: -0.5, 11: -0.5 }[iv];
    const fa = fn(a), fb = fn(b);
    if (fa !== undefined && fb !== undefined) s += ({ 12: 0.6, 20: 0.8, '01': 0.3, 21: -0.5 })[`${fa}${fb}`] ?? 0;
    if (a.suffix === 'dim7' && (a.root + 1) % 12 === b.root) s += 1.2;
    return s + 0.15 * Math.min(3, a.pcs.filter((p) => b.pcs.includes(p)).length);
  };
  let prev = cols[0].map((c) => ({ s: unary(c), from: -1 })); const back = [prev];
  for (let i = 1; i < cols.length; i++) {
    prev = cols[i].map((c) => { let best = { s: -Infinity };
      cols[i - 1].forEach((p, k) => { const s = back[i - 1][k].s + trans(p, c); if (s > best.s) best = { s, from: k }; });
      return { s: best.s + unary(c), from: best.from }; });
    back.push(prev);
  }
  let j = prev.reduce((b, x, k) => (x.s > prev[b].s ? k : b), 0); const out = [];
  for (let i = cols.length - 1; i >= 0; i--) {
    out[i] = { name: cols[i][j].name, alts: cols[i].filter((_, k) => k !== j).map((c) => c.name) }; j = back[i][j].from;
  }
  return { key, chords: out };
}
```

(Nota: el prototipo ejecutado usa `'12'`/`'20'` como claves de cadena; es equivalente. Adaptar el parser a la ortografía real de `chordNames`, que
usa `b` y `#`; `m(maj7)` se parsea porque el sufijo es no voraz hasta la barra.)

## 6. Ejemplos resueltos (salida real del prototipo)

1. **C6 vs Am7/C.** `Dm7 | G7 | {C6, Am7/C}` → tonalidad Do mayor, elige **C6** (I con U = 1 − 0,6 = 0,4, contra vi7 invertido
   0,6 − 0,1 − 1,2 = −0,7; además G7→C cae una quinta). `Am | {C6, Am7/C} | Dm | E7 | Am` → La menor (final y E7 con sol#), elige
   **Am7/C**: aunque tiene inversión (−1,2), el grado i vale 1, y C6 sería III con 6ª (0,3 − 0,6), y la transición Am→Am7/C comparte tres notas.
2. **G#m7/F# vs B6/F#** (`F# G# B D#`). En Mi mayor (`E | A | {…} | B7 | E`) sale **B6/F#** (V con 6ª, de grado 0,9, que además enlaza con B7 con raíz repetida y 3 notas comunes). En Do# menor
   (`C#m | {…} | G#7 | C#m`) sale **G#m7/F#** (v7 en tercera inversión, que enlaza con G#7 con raíz repetida). Es el resultado del prototipo; no es una
   verdad musical: ambas lecturas son plausibles y el desempate depende de los pesos, por eso se conservan como alternativas.
3. **Dm7b5 vs Fm6/D.** `Cm | {Dm7b5, Fm6/D} | G7 | Cm` → **Dm7b5** (ii° con raíz en el bajo, S→D) y no Fm6/D (iv invertido, −1,2). Con `Cm | {Fm6, Dm7b5/F} | G | Cm`
   gana **Fm6** (raíz en el bajo, iv). Es lo que se espera: el bajo manda cuando la tonalidad admite ambas.
4. **dim7.** `C | {Bdim7, Ddim7/B, Fdim7/B…} | C` → **Bdim7**; `Am | {G#dim7, Bdim7/G#, Ddim7/G#…} | Am` → **G#dim7**. Todos los candidatos tienen las
   mismas notas; decide `dim7 → raíz+1` (+1,2) y el bajo (sin `DEG`, no ganan por «grado»). Sin esa regla salía Fdim7/B porque IV pesa más que vii.

Caso difícil: `Dm | E7 | {C6, Am7/C}` se estimaba Do mayor y salía C6; con `W.sixth` sale **Am7/C**. En el ii–V–I (`Dm7 | G7 | {C6, Am7/C}`) sigue ganando C6: el contexto pesa más que el bono.

## 7. Límites conocidos

- Los pesos son heurísticos, ajustados a mano con ~10 secuencias; ninguna fuente consultada los fija. Hay que validar con un corpus
  (p. ej. corales con análisis romano) antes de fiarse. Los perfiles de Temperley están sin verificar (ver tabla).
- Tonalidad global: no hay modulación. Para piezas largas, repetir la estimación en ventanas de 4–8 compases con una penalización por
  cambio de tono (idea apoyada por la literatura de segmentación tonal, Choi 2011).
- Histograma sin duración ni métrica: el prototipo ignora tiempos fuertes (regla de Temperley–Sleator), notas de paso y bordaduras (las columnas
  de `chordNames` ya vienen de notas simultáneas, así que no hay disonancias ornamentales entre columnas, pero sí dentro de una).
- Con una sola columna (o pocas) no hay contexto: cae al prior intrínseco (raíz en el bajo, forma simple). Es el comportamiento actual de `chordNames`.
- Modo menor: solo escala natural + sensible; la melódica (6ª elevada) cuenta como alteración y se penaliza.
- Préstamos modales (bVII, iv en mayor) y napolitana/sextas aumentadas no se modelan; salen penalizados por `oos`.
- Ortografía enarmónica (G#m7 vs Abm7) se hereda de `chordNames`; no se desambigua por tonalidad.
- Sin voces/bajo real: el prototipo usa el bajo del nombre. Un acorde con bajo en la tónica (pedal) puede ser más raro de lo que el modelo supone.
- Inconsistencia de numeración de funciones: el vii se tomó como D; OMT lo agrupa con T en la lista de grados característicos.
