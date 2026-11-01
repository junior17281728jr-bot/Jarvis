// Loterías cubiertas. Los horarios se marcan "por verificar" hasta confirmarlos con la fuente oficial.
// Las jugadas se cierran 5 minutos antes del sorteo.
export const GAMES = {
  real: {
    id: 'real', entity: 'Lotería Real', name: 'Quiniela Real', format: 'quiniela',
    time: () => [12, 55], verified: false,
    sources: ['nacionalloteria.com/quiniela-real', 'premios.do/resultados-real'],
  },
  nacional: {
    id: 'nacional', entity: 'Lotería Nacional', name: 'Nacional Gana Más', format: 'quiniela',
    time: () => [14, 55], verified: false,
    sources: ['premios.do/resultados-gana-mas', 'nacionalloteria.com/gana-mas'],
  },
  'nacional-noche': {
    id: 'nacional-noche', entity: 'Lotería Nacional', name: 'Lotería Nacional (noche)', format: 'quiniela',
    time: wd => (wd === 0 ? [18, 0] : [21, 0]), verified: false,
    sources: ['premios.do/resultados-nacional-noche', 'nacionalloteria.com/loteria-nacional'],
  },
  loteka: {
    id: 'loteka', entity: 'Loteka', name: 'Quiniela Loteka', format: 'quiniela',
    time: () => [19, 55], verified: false,
    sources: ['premios.do/resultados-loteka', 'nacionalloteria.com/quiniela-loteka'],
  },
  leidsa: {
    id: 'leidsa', entity: 'Leidsa', name: 'Quiniela Leidsa', format: 'quiniela',
    time: wd => (wd === 0 ? [15, 55] : [20, 55]), verified: false,
    sources: ['premios.do/resultados-leidsa', 'nacionalloteria.com/quiniela-leidsa'],
  },
};

export const KINDS = { quiniela: 1, pale: 2, tripleta: 3 };
export const KIND_LABEL = { quiniela: 'Quiniela', pale: 'Palé', tripleta: 'Tripleta' };

export function isValidNumbers(nums, kind) {
  if (!Array.isArray(nums) || nums.length !== KINDS[kind]) return false;
  if (!nums.every(n => /^\d{2}$/.test(n))) return false;
  return new Set(nums).size === nums.length;
}
export function isValidDraw(nums) {
  return Array.isArray(nums) && nums.length === 3 && nums.every(n => /^\d{2}$/.test(n));
}
