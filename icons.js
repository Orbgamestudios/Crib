// Hand-drawn vector icons, one per joker / tarot. All 48x48 viewBox.
const G = '#e8c35a', R = '#d6453a', C = '#f4ead8', D = '#1c2730', P = '#b48be0', BL = '#2f3d4a';

function svg(inner) {
  return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<defs><radialGradient id="aura" cx="50%" cy="28%" r="68%"><stop offset="0" stop-color="#fff4b8" stop-opacity=".55"/><stop offset=".55" stop-color="#6a4b86" stop-opacity=".18"/><stop offset="1" stop-color="#111820" stop-opacity=".18"/></radialGradient></defs>` +
    `<rect x="2.5" y="2.5" width="43" height="43" rx="8" fill="url(#aura)" stroke="#ffffff28" stroke-width="1"/>` +
    `<path d="M8 38c8-4 24-4 32 0" fill="none" stroke="#ffffff20" stroke-width="2" stroke-linecap="round"/>` +
    inner +
    `</svg>`;
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
  even_steven: svg(
    `<rect x="6" y="12" width="16" height="22" rx="3" fill="${C}" stroke="${D}" stroke-width="1.5"/>` +
    `<rect x="26" y="14" width="16" height="22" rx="3" fill="${C}" stroke="${D}" stroke-width="1.5" transform="rotate(7 34 25)"/>` +
    txt(14, 28, '2', 13) + txt(34, 31, '4', 13, R, 'transform="rotate(7 34 25)"')
  ),
  odd_todd: svg(
    `<rect x="6" y="12" width="16" height="22" rx="3" fill="${C}" stroke="${D}" stroke-width="1.5" transform="rotate(-7 14 23)"/>` +
    `<rect x="26" y="12" width="16" height="22" rx="3" fill="${C}" stroke="${D}" stroke-width="1.5"/>` +
    txt(14, 28, 'A', 13, R, 'transform="rotate(-7 14 23)"') + txt(34, 28, '3', 13)
  ),
  fibonacci: svg(
    `<path d="M24 24a4 4 0 014-4 7 7 0 01-7 7A11 11 0 0132 38 17 17 0 016 27 24 24 0 0140 9" fill="none" stroke="${G}" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="24" cy="24" r="2.4" fill="${R}"/>`
  ),
  walkie_talkie: svg(
    `<rect x="15" y="12" width="18" height="28" rx="3.5" fill="${BL}" stroke="${D}" stroke-width="1.5"/>` +
    `<line x1="20" y1="12" x2="20" y2="4" stroke="${BL}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<rect x="18.5" y="17" width="11" height="6" rx="1.5" fill="#9fd3a8"/>` +
    txt(24, 33, '10·4', 6.5, G)
  ),
  scary_face: svg(
    card(14, 10, 0) +
    `<circle cx="19" cy="19" r="2.1" fill="${D}"/><circle cx="27" cy="19" r="2.1" fill="${D}"/>` +
    `<path d="M18 27q5-3.5 10 0v2q-5 3.5-10 0z" fill="${R}"/>` +
    `<path d="M16 13l3 2.5M30 13l-3 2.5" stroke="${D}" stroke-width="1.6" stroke-linecap="round"/>`
  ),
  greedy_joker: svg(
    `<path d="M24 6l13 18-13 18-13-18z" fill="${G}" stroke="${D}" stroke-width="1.6"/>` +
    txt(24, 29, '$', 13, D)
  ),
  lusty_joker: svg(
    `<path d="M24 41C13 32 7 25 7 17.5 7 12 11 8 16 8c3.4 0 6.4 1.8 8 4.6C25.6 9.8 28.6 8 32 8c5 0 9 4 9 9.5C41 25 35 32 24 41z" fill="${R}" stroke="${D}" stroke-width="1.4"/>` +
    `<path d="M16 19q2-2 4 0M28 19q2-2 4 0" stroke="${C}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
    `<path d="M20 26q4 3 8 0" stroke="${C}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
  ),
  gluttonous_joker: svg(
    `<circle cx="16" cy="20" r="8.5" fill="${BL}"/><circle cx="32" cy="20" r="8.5" fill="${BL}"/>` +
    `<circle cx="24" cy="13" r="8.5" fill="${BL}"/>` +
    `<path d="M21 28h6l3 13h-12z" fill="${BL}"/>` +
    `<path d="M36 9a5 5 0 11-7 7 8 8 0 017-7z" fill="${G}"/>`
  ),
  wrathful_joker: svg(
    `<path d="M24 5C18 14 8 19 8 27a9.5 9.5 0 0016 7l-3 9h6l-3-9a9.5 9.5 0 0016-7c0-8-10-13-16-22z" fill="${BL}" stroke="${D}" stroke-width="1.3"/>` +
    `<path d="M16 22l6 3M32 22l-6 3" stroke="${R}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<circle cx="20" cy="28" r="1.8" fill="${R}"/><circle cx="28" cy="28" r="1.8" fill="${R}"/>`
  ),
  shortcut: svg(
    `<rect x="5" y="26" width="11" height="15" rx="2" fill="${C}" stroke="${D}" stroke-width="1.3"/>` +
    `<rect x="32" y="26" width="11" height="15" rx="2" fill="${C}" stroke="${D}" stroke-width="1.3"/>` +
    txt(10.5, 37, '3', 9) + txt(37.5, 37, '7', 9, R) +
    `<path d="M10 24Q24 4 38 24" fill="none" stroke="${G}" stroke-width="2.6" stroke-dasharray="4 4" stroke-linecap="round"/>` +
    `<path d="M38 24l-5-2m5 2l-1-6" stroke="${G}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
  ),
  muggins: svg(
    `<path d="M6 30q8-7 17-4l9 3-2 6-9-2q-8-1-15 3z" fill="#d9a066" stroke="${D}" stroke-width="1.4"/>` +
    `<path d="M30 26l4-13 5 1.5-4 13z" fill="#d9a066" stroke="${D}" stroke-width="1.4"/>` +
    txt(36, 12, '+2', 11, G)
  ),
  nineteen: svg(
    `<path d="M12 42V18a12 12 0 0124 0v24h-7V19a5 5 0 00-10 0v23z" fill="${G}" stroke="${D}" stroke-width="1.5"/>` +
    txt(24, 30, '19', 12, R)
  ),
  skunk_line: svg(
    `<rect x="6" y="20" width="36" height="9" rx="2" fill="${D}"/>` +
    `<rect x="6" y="22.5" width="36" height="4" fill="${C}"/>` +
    `<path d="M38 12q5 4 4 9l-6-1z" fill="${BL}"/>` +
    txt(24, 41, '+5', 11, G)
  ),
  his_majesty: svg(
    card(16, 16, 0) +
    `<path d="M14 14l5 4 5-7 5 7 5-4v6H14z" fill="${G}" stroke="${D}" stroke-width="1.3"/>` +
    txt(24, 33, 'K', 11, R)
  ),
  pony_express: svg(
    `<path d="M24 8c9 0 15 7 15 15v12h-7V24a8 8 0 00-16 0v11H9V23c0-8 6-15 15-15z" fill="${G}" stroke="${D}" stroke-width="1.6"/>` +
    `<circle cx="13" cy="32" r="1.7" fill="${D}"/><circle cx="35" cy="32" r="1.7" fill="${D}"/>` +
    `<circle cx="11.5" cy="25" r="1.7" fill="${D}"/><circle cx="36.5" cy="25" r="1.7" fill="${D}"/>` +
    txt(24, 28, '1st', 8, D)
  ),
  small_ball: svg(
    `<circle cx="14" cy="32" r="7.5" fill="${C}" stroke="${D}" stroke-width="1.4"/>` +
    `<circle cx="30" cy="35" r="5.5" fill="${R}" stroke="${D}" stroke-width="1.4"/>` +
    `<circle cx="32" cy="17" r="9" fill="${G}" stroke="${D}" stroke-width="1.4"/>` +
    txt(14, 35.5, '2', 9) + txt(30, 38, '3', 8, C) + txt(32, 21, '5', 11)
  ),
  bull_market: svg(
    `<path d="M10 14q-6-1-7-7 7-1 10 4zM38 14q6-1 7-7-7-1-10 4z" fill="${C}" stroke="${D}" stroke-width="1.3"/>` +
    `<path d="M24 12c-7 0-12 5-12 11 0 7 5 12 12 12s12-5 12-12c0-6-5-11-12-11z" fill="#7a4a32" stroke="${D}" stroke-width="1.4"/>` +
    `<circle cx="19" cy="22" r="1.8" fill="${D}"/><circle cx="29" cy="22" r="1.8" fill="${D}"/>` +
    `<circle cx="21" cy="30" r="1.4" fill="${D}"/><circle cx="27" cy="30" r="1.4" fill="${D}"/>` +
    `<path d="M40 38l4-6m-4 6l-6 1" stroke="${G}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
  ),
  rocket: svg(
    `<path d="M24 4c6 5 8 12 8 18l-4 11h-8l-4-11c0-6 2-13 8-18z" fill="${C}" stroke="${D}" stroke-width="1.5"/>` +
    `<circle cx="24" cy="17" r="3.5" fill="#7fb4d8" stroke="${D}" stroke-width="1.2"/>` +
    `<path d="M16 26l-6 6 7 1zM32 26l6 6-7 1z" fill="${R}"/>` +
    `<path d="M21 35h6l-3 9z" fill="${G}"/>`
  ),
  crib_copier: svg(
    card(8, 14, -10) + card(24, 14, 10) +
    `<path d="M18 38q7 4 14 0" fill="none" stroke="${G}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M32 38l-5-1m5 1l-2 5" fill="none" stroke="${G}" stroke-width="2.4" stroke-linecap="round"/>` +
    txt(16, 29, 'C', 9, R, 'transform="rotate(-10 16 25)"') +
    txt(32, 29, 'C', 9, R, 'transform="rotate(10 32 25)"')
  ),
  ace_chaser: svg(
    card(15, 10, 0) +
    `<circle cx="34" cy="33" r="7" fill="${G}" stroke="${D}" stroke-width="1.4"/>` +
    txt(23, 28, 'A', 15, R) +
    txt(34, 37, '+3', 8, D)
  ),
  low_rider: svg(
    `<path d="M8 32h32" stroke="${G}" stroke-width="3" stroke-linecap="round"/>` +
    card(5, 13, -12) + card(16, 12, 0) + card(27, 13, 12) +
    txt(13, 28, 'A', 8, R, 'transform="rotate(-12 13 24)"') +
    txt(24, 27, '2', 8) +
    txt(35, 28, '3', 8, R, 'transform="rotate(12 35 24)"')
  ),
  coin_clip: svg(
    `<rect x="13" y="9" width="22" height="31" rx="5" fill="${BL}" stroke="${D}" stroke-width="1.5"/>` +
    `<path d="M18 12v24M30 12v24" stroke="${C}" stroke-width="1.2" opacity=".55"/>` +
    `<circle cx="24" cy="25" r="8" fill="${G}" stroke="${D}" stroke-width="1.4"/>` +
    txt(24, 29, '$', 12, D)
  ),
  blueprint: svg(
    `<rect x="6" y="8" width="36" height="30" rx="2.5" fill="#274b73" stroke="#9fc4e8" stroke-width="1.8"/>` +
    `<path d="M6 16h36M6 24h36M6 32h36M14 8v30M24 8v30M34 8v30" stroke="#9fc4e8" stroke-width="0.7" opacity="0.5"/>` +
    `<path d="M14 27q8-9 17-3" fill="none" stroke="${C}" stroke-width="2.2" stroke-dasharray="3 3"/>` +
    `<path d="M31 24l3 1-2 3z" fill="${C}"/>` +
    txt(24, 45.5, 'COPY →', 6, '#9fc4e8')
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
  strength: svg(tarotFrame('XI',
    `<path d="M15 34V22q0-8 7-8 6 0 6 6v4h4q4 0 4 5v5" fill="none" stroke="${G}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M24 12V7m0 0l-3 3m3-3l3 3M33 16l3-4m-3 4l4 .5" stroke="${P}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`)),
  empress: svg(tarotFrame('III',
    `<path d="M24 36c-7-5.5-11-10-11-15 0-3.5 2.6-6 6-6 2.2 0 4 1.1 5 2.9 1-1.8 2.8-2.9 5-2.9 3.4 0 6 2.5 6 6 0 5-4 9.5-11 15z" fill="${R}"/>` +
    `<path d="M16 11l3 2.5 5-4 5 4 3-2.5v4H16z" fill="${G}"/>`)),
  emperor: svg(tarotFrame('IV',
    `<path d="M24 13l9 12-9 12-9-12z" fill="${R}"/>` +
    `<path d="M16 9l3 2.5 5-4 5 4 3-2.5v4H16z" fill="${G}"/>`)),
  devil: svg(tarotFrame('XV',
    `<circle cx="18" cy="22" r="5.5" fill="${C}"/><circle cx="30" cy="22" r="5.5" fill="${C}"/>` +
    `<circle cx="24" cy="16" r="5.5" fill="${C}"/>` +
    `<path d="M22 27h4l2 8h-8z" fill="${C}"/>` +
    `<path d="M15 11l3 4M33 11l-3 4" stroke="${R}" stroke-width="2.4" stroke-linecap="round"/>`)),
  tower: svg(tarotFrame('XVI',
    `<path d="M24 12C19 19 13 23 13 28a6.5 6.5 0 0011 4.5l-2 5h4l-2-5A6.5 6.5 0 0035 28c0-5-6-9-11-16z" fill="${C}"/>` +
    `<path d="M30 8l-5 7h4l-6 8 2-6h-4l5-9z" fill="${G}"/>`)),
  priestess: svg(tarotFrame('II',
    `<g transform="rotate(-8 21 24)"><rect x="14" y="13" width="13" height="18" rx="2" fill="${C}" stroke="#241733" stroke-width="1"/></g>` +
    `<g transform="rotate(8 29 26)"><rect x="22" y="15" width="13" height="18" rx="2" fill="${C}" stroke="#241733" stroke-width="1" opacity="0.85"/></g>` +
    `<circle cx="33" cy="13" r="5.5" fill="${G}"/>` +
    `<path d="M33 10.5v5M30.5 13h5" stroke="#241733" stroke-width="1.6"/>`)),
  hanged_man: svg(tarotFrame('XII',
    `<line x1="13" y1="10" x2="35" y2="10" stroke="${G}" stroke-width="2.4"/>` +
    `<line x1="24" y1="10" x2="24" y2="16" stroke="${G}" stroke-width="1.8"/>` +
    `<circle cx="24" cy="30" r="4.5" fill="${C}"/>` +
    `<path d="M24 16v10m0 0l-5 7m5-7l5 7" stroke="${C}" stroke-width="2.4" stroke-linecap="round" transform="rotate(180 24 24)"/>`)),
  judgement: svg(tarotFrame('XX',
    `<path d="M13 14l18 5v8l-18 5q-3-9 0-18z" fill="${G}"/>` +
    `<path d="M31 17h4v12h-4z" fill="${G}"/>` +
    `<path d="M38 14l4-3M39 23h5M38 31l4 3" stroke="${P}" stroke-width="1.8" stroke-linecap="round"/>`)),
};

export const PACK_ICONS = {
  buffoon: svg(
    `<rect x="10" y="6" width="28" height="38" rx="4" fill="#6b4f1d" stroke="${G}" stroke-width="2.2"/>` +
    `<path d="M10 16q14 6 28 0" fill="none" stroke="${G}" stroke-width="1.6"/>` +
    `<path d="M24 22l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z" fill="${G}"/>` +
    txt(24, 43, 'JOKER', 6, G)
  ),
  arcana: svg(
    `<rect x="10" y="6" width="28" height="38" rx="4" fill="#2c1b42" stroke="${P}" stroke-width="2.2"/>` +
    `<path d="M10 16q14 6 28 0" fill="none" stroke="${P}" stroke-width="1.6"/>` +
    `<path d="M24 20q8 4 0 14-8-10 0-14z" fill="${P}"/>` +
    `<circle cx="24" cy="27" r="2.6" fill="#2c1b42"/><circle cx="24" cy="27" r="1.2" fill="${C}"/>` +
    txt(24, 43, 'ARCANA', 6, P)
  ),
  standard: svg(
    `<rect x="10" y="6" width="28" height="38" rx="4" fill="#1d3a5c" stroke="#7fb4d8" stroke-width="2.2"/>` +
    `<path d="M10 16q14 6 28 0" fill="none" stroke="#7fb4d8" stroke-width="1.6"/>` +
    `<g transform="rotate(-10 20 28)"><rect x="15" y="21" width="10" height="14" rx="1.5" fill="${C}"/></g>` +
    `<g transform="rotate(10 29 28)"><rect x="24" y="21" width="10" height="14" rx="1.5" fill="${C}"/></g>` +
    txt(20, 30, '♥', 7, R, 'transform="rotate(-10 20 28)"') +
    txt(29, 30, '♠', 7, D, 'transform="rotate(10 29 28)"') +
    txt(24, 43, 'CARDS', 6, '#7fb4d8')
  ),
};
