// Hand-drawn vector icons, one per joker / tarot. All 48x48 viewBox.
const G = '#e8c35a', R = '#d6453a', C = '#f4ead8', D = '#1c2730', P = '#b48be0', BL = '#2f3d4a';

function svg(inner) {
  return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}
const card = (x, y, rot, fill = C) =>
  `<g transform="rotate(${rot} ${x + 8} ${y + 11})"><rect x="${x}" y="${y}" width="16" height="22" rx="2.5" fill="${fill}" stroke="${D}" stroke-width="1.4"/></g>`;
const txt = (x, y, s, size, fill = D, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="800" font-family="Georgia,serif" text-anchor="middle" fill="${fill}" ${extra}>${s}</text>`;

export const JOKER_ICONS = {
  fifteen_fanatic: svg(
    `<path d="M24 3l4 9 10-3-5 9 9 6-10 2 2 10-9-6-7 8-1-11-10-2 8-6-6-9 10 3z" fill="${G}" stroke="${D}" stroke-width="1.5"/>` +
    txt(24, 29, '15', 13, R)
  ),
  pair_pal: svg(
    card(8, 12, -12) + card(24, 12, 12) +
    txt(16, 27, '♥', 11, R, 'transform="rotate(-12 16 23)"') +
    txt(32, 27, '♥', 11, R, 'transform="rotate(12 32 23)"')
  ),
  run_baron: svg(
    `<rect x="6" y="28" width="10" height="12" rx="1.5" fill="${C}" stroke="${D}" stroke-width="1.4"/>` +
    `<rect x="19" y="20" width="10" height="20" rx="1.5" fill="${C}" stroke="${D}" stroke-width="1.4"/>` +
    `<rect x="32" y="12" width="10" height="28" rx="1.5" fill="${C}" stroke="${D}" stroke-width="1.4"/>` +
    `<path d="M8 18L30 6" stroke="${G}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M30 6l-7 1m7-1l-1 7" stroke="${G}" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    txt(11, 37, 'A', 7) + txt(24, 33, '2', 7) + txt(37, 25, '3', 7)
  ),
  flush_broker: svg(
    card(4, 14, -20) + card(13, 11, -7) + card(22, 11, 7) + card(31, 14, 20) +
    txt(12, 29, '♦', 10, G, 'transform="rotate(-20 12 25)"') +
    txt(21, 26, '♦', 10, G, 'transform="rotate(-7 21 22)"') +
    txt(30, 26, '♦', 10, G, 'transform="rotate(7 30 22)"') +
    txt(39, 29, '♦', 10, G, 'transform="rotate(20 39 25)"')
  ),
  sir_nobs: svg(
    `<path d="M10 16l5 6 9-9 9 9 5-6v10H10z" fill="${G}" stroke="${D}" stroke-width="1.5"/>` +
    `<circle cx="10" cy="15" r="2.5" fill="${G}"/><circle cx="24" cy="12" r="2.5" fill="${G}"/><circle cx="38" cy="15" r="2.5" fill="${G}"/>` +
    txt(24, 42, 'J', 17, C) +
    `<circle cx="33" cy="36" r="4.5" fill="none" stroke="${G}" stroke-width="1.8"/>` +
    `<path d="M36 40l4 4" stroke="${G}" stroke-width="1.8" stroke-linecap="round"/>`
  ),
  golden_crib: svg(
    `<path d="M8 22h32v14a4 4 0 01-4 4H12a4 4 0 01-4-4z" fill="${G}" stroke="${D}" stroke-width="1.6"/>` +
    `<path d="M8 22c0-7 7-11 16-11s16 4 16 11" fill="none" stroke="${G}" stroke-width="3"/>` +
    `<rect x="20" y="24" width="8" height="7" rx="1.5" fill="${D}"/>` +
    `<circle cx="24" cy="28" r="1.6" fill="${G}"/>` +
    `<path d="M38 8l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="${C}"/>`
  ),
  counter_king: svg(
    `<path d="M12 14l6 7 6-10 6 10 6-7v12H12z" fill="${G}" stroke="${D}" stroke-width="1.5"/>` +
    txt(24, 42, '×2', 15, C)
  ),
  last_card_larry: svg(
    card(14, 16, -6) +
    `<line x1="30" y1="6" x2="30" y2="22" stroke="${D}" stroke-width="2"/>` +
    `<path d="M30 6h12v8H30z" fill="${C}" stroke="${D}" stroke-width="1.2"/>` +
    `<path d="M30 6h4v4h-4zm8 0h4v4h-4zM34 10h4v4h-4z" fill="${D}"/>` +
    txt(22, 31, '♠', 11, D, 'transform="rotate(-6 22 27)"')
  ),
  five_alive: svg(
    `<path d="M27 3L13 26h8l-4 19 16-26h-9z" fill="${G}" stroke="${D}" stroke-width="1.5"/>` +
    txt(36, 18, '5', 14, R)
  ),
  jack_of_all: svg(
    `<path d="M9 36l14-14m0 0a6.5 6.5 0 108-8l-5 5-4-1-1-4 5-5a6.5 6.5 0 00-8 8" fill="none" stroke="${BL}" stroke-width="3.4" stroke-linejoin="round"/>` +
    `<rect x="6" y="33" width="7" height="7" rx="2" fill="${BL}"/>` +
    txt(35, 42, 'J', 15, G)
  ),
  salute_31: svg(
    `<path d="M18 4h5l-2 12h-3zM25 4h5l-4 12h-3z" fill="${R}"/>` +
    `<circle cx="24" cy="29" r="13" fill="${G}" stroke="${D}" stroke-width="1.6"/>` +
    `<circle cx="24" cy="29" r="9.5" fill="none" stroke="${D}" stroke-width="1"/>` +
    txt(24, 34, '31', 11, D)
  ),
  overseer: svg(
    `<path d="M4 24q20-17 40 0Q24 41 4 24z" fill="${C}" stroke="${D}" stroke-width="1.6"/>` +
    `<circle cx="24" cy="24" r="7.5" fill="#3d7a4f"/>` +
    `<circle cx="24" cy="24" r="3.4" fill="${D}"/>` +
    `<circle cx="26.5" cy="21.5" r="1.4" fill="${C}"/>`
  ),
  mugs_coin: svg(
    `<rect x="9" y="14" width="20" height="26" rx="3" fill="${C}" stroke="${D}" stroke-width="1.6"/>` +
    `<path d="M29 19h6a5 5 0 015 5v6a5 5 0 01-5 5h-6" fill="none" stroke="${D}" stroke-width="2.4"/>` +
    `<path d="M9 18q5 4 10-1t10 1v3H9z" fill="${C}"/>` +
    `<circle cx="19" cy="30" r="6" fill="${G}" stroke="${D}" stroke-width="1.3"/>` +
    txt(19, 33.5, '¢', 9, D)
  ),
  cutpurse: svg(
    `<circle cx="13" cy="36" r="4.5" fill="none" stroke="${BL}" stroke-width="2.6"/>` +
    `<circle cx="29" cy="38" r="4.5" fill="none" stroke="${BL}" stroke-width="2.6"/>` +
    `<path d="M16 33L38 8M26 35L14 8" stroke="${BL}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="38" cy="28" r="7" fill="${G}" stroke="${D}" stroke-width="1.4"/>` +
    txt(38, 32, '$', 10, D)
  ),
  heels_hunter: svg(
    `<path d="M10 8h9v16q9 1 13 8l2 8H10z" fill="${BL}" stroke="${D}" stroke-width="1.5"/>` +
    `<rect x="10" y="36" width="24" height="5" rx="1.5" fill="${G}"/>` +
    card(28, 6, 18) + txt(36, 21, 'J', 10, R, 'transform="rotate(18 36 17)"')
  ),
};

const tarotFrame = (roman, inner) =>
  `<rect x="7" y="3" width="34" height="42" rx="3.5" fill="#241733" stroke="${P}" stroke-width="2"/>` +
  inner + txt(24, 42.5, roman, 6.5, P);

export const TAROT_ICONS = {
  sun: svg(tarotFrame('XIX',
    `<circle cx="24" cy="22" r="8" fill="${G}"/>` +
    `<g stroke="${G}" stroke-width="2.2" stroke-linecap="round">` +
    `<line x1="24" y1="8" x2="24" y2="11"/><line x1="24" y1="33" x2="24" y2="36"/>` +
    `<line x1="11" y1="22" x2="14" y2="22"/><line x1="34" y1="22" x2="37" y2="22"/>` +
    `<line x1="15" y1="13" x2="17" y2="15"/><line x1="31" y1="29" x2="33" y2="31"/>` +
    `<line x1="33" y1="13" x2="31" y2="15"/><line x1="17" y1="29" x2="15" y2="31"/></g>` +
    `<circle cx="21.5" cy="20.5" r="1.1" fill="#241733"/><circle cx="26.5" cy="20.5" r="1.1" fill="#241733"/>` +
    `<path d="M21 25q3 2.4 6 0" stroke="#241733" stroke-width="1.2" fill="none"/>`)),
  moon: svg(tarotFrame('XVIII',
    `<path d="M30 10a13 13 0 100 25 11 11 0 010-25z" fill="${C}"/>` +
    `<path d="M14 14l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9zM35 28l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="${G}"/>`)),
  death: svg(tarotFrame('XIII',
    `<path d="M24 9c-7 0-11 5-11 11 0 4 2 7 4 8v5h14v-5c2-1 4-4 4-8 0-6-4-11-11-11z" fill="${C}"/>` +
    `<circle cx="19.5" cy="21" r="2.8" fill="#241733"/><circle cx="28.5" cy="21" r="2.8" fill="#241733"/>` +
    `<path d="M24 25l-1.6 3.5h3.2z" fill="#241733"/>` +
    `<path d="M19 33v3m5-3v3m5-3v3" stroke="#241733" stroke-width="1.6"/>`)),
  lovers: svg(tarotFrame('VI',
    `<path d="M19 13c-3.6 0-6 2.6-6 5.6 0 4.8 6.5 8.4 8.5 11 .6-.8 1.6-1.7 2.7-2.8-1.8-2.4-3.2-4.9-3.2-7.6 0-2.4 1-4.5 2.6-5.7-1.1-.4-2.7-.5-4.6-.5z" fill="${R}"/>` +
    `<path d="M29 14c-3.3 0-5.5 2.4-5.5 5.2 0 4.4 6 7.8 7.8 10.2 1.9-2.4 7.7-5.8 7.7-10.2 0-2.8-2.2-5.2-5.5-5.2-1.8 0-3.4.8-4.5 2.1z" fill="${R}" transform="translate(-7 2)"/>`)),
  justice: svg(tarotFrame('VIII',
    `<line x1="24" y1="9" x2="24" y2="34" stroke="${G}" stroke-width="2.2"/>` +
    `<line x1="12" y1="14" x2="36" y2="14" stroke="${G}" stroke-width="2.2"/>` +
    `<path d="M12 14l-4 9h8zM36 14l-4 9h8z" fill="none" stroke="${G}" stroke-width="1.6"/>` +
    `<path d="M8 23a4 4 0 008 0M32 23a4 4 0 008 0" fill="none" stroke="${G}" stroke-width="1.6"/>` +
    `<rect x="18" y="33" width="12" height="3" rx="1.5" fill="${G}"/>`)),
  star: svg(tarotFrame('XVII',
    `<path d="M24 8l3.2 8.2 8.8.6-6.8 5.6 2.2 8.6L24 26l-7.4 5 2.2-8.6-6.8-5.6 8.8-.6z" fill="${G}"/>` +
    `<path d="M13 32q5 4 11 1" stroke="${P}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`)),
  wheel: svg(tarotFrame('X',
    `<circle cx="24" cy="23" r="12" fill="none" stroke="${G}" stroke-width="2.4"/>` +
    `<circle cx="24" cy="23" r="3" fill="${G}"/>` +
    `<g stroke="${G}" stroke-width="1.8"><line x1="24" y1="11" x2="24" y2="35"/>` +
    `<line x1="12" y1="23" x2="36" y2="23"/><line x1="15.5" y1="14.5" x2="32.5" y2="31.5"/>` +
    `<line x1="32.5" y1="14.5" x2="15.5" y2="31.5"/></g>`)),
  hermit: svg(tarotFrame('IX',
    `<path d="M20 12h8l2 4v14l-2 4h-8l-2-4V16z" fill="none" stroke="${G}" stroke-width="2"/>` +
    `<line x1="24" y1="8" x2="24" y2="12" stroke="${G}" stroke-width="2"/>` +
    `<path d="M24 18l2.4 5h-4.8z" fill="${G}"/>` +
    `<circle cx="24" cy="26" r="2.2" fill="${G}"/>`)),
};
