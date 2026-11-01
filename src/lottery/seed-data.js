// Resultados reales recopilados el 28 de octubre de 2026 (premios.do y nacionalloteria.com).
// Se cargan como observaciones de una fuente; el servidor las confirma con la segunda fuente al actualizar.
const L = '27 64 06 71|26 16 59 61|25 16 93 03|24 86 62 58|23 07 93 12|22 66 61 23|21 53 89 92|20 70 97 39|19 37 14 79|18 37 71 06|17 61 09 25|16 89 83 77|15 83 77 50|14 00 08 43';
const N = '27 02 12 66|26 67 31 26|25 05 88 96|24 71 93 10|23 69 13 15|22 62 87 49|21 13 60 74|20 87 77 29|19 33 64 55|18 90 27 22|17 70 01 66|16 46 08 83|15 92 42 07|14 26 47 09';
const K = '27 64 88 08|26 04 34 11|25 54 87 77|24 56 44 38|23 53 85 27|22 65 85 62|21 47 59 45|20 30 71 01|19 86 83 04|18 50 56 69|17 17 57 97|16 88 54 16|15 52 51 11|14 36 56 20';
const R = '27 26 24 13|26 90 32 65|25 26 32 72|24 96 65 03|23 31 77 53|22 03 77 87|21 28 61 58|20 71 05 73|19 07 40 38|18 65 98 24|17 21 90 78|16 76 01 41|15 98 33 05|14 20 43 39|13 94 81 55|12 57 43 53|11 97 22 64|10 23 93 24|09 50 34 62|08 44 49 59|07 40 50 45|06 66 37 43|05 03 19 45|04 48 25 08|03 48 73 44';
// Leidsa del 27 también confirmado en nacionalloteria.com (segunda fuente)
export const SEED = [
  ...[['leidsa', L, 'premios.do'], ['nacional', N, 'premios.do'], ['loteka', K, 'premios.do'], ['real', R, 'nacionalloteria.com']]
    .flatMap(([game, s, source]) => s.split('|').map(row => { const [d, ...nums] = row.split(' '); return { game, date: `2026-10-${d}`, source, nums }; })),
  { game: 'leidsa', date: '2026-10-27', source: 'nacionalloteria.com', nums: ['64', '06', '71'] },
];
