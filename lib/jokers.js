import { makeCard } from './cards.js';

// Jokers are passive modifiers. `mods` keys are aggregated by aggregateMods:
//   *Mult keys multiply, *Val keys take the best value, flags OR, the rest add.
export const JOKERS = [
  // scoring repricers
  { id: 'fifteen_fanatic', name: 'Fifteen Fanatic', desc: 'Your fifteens score 3 instead of 2.', cost: 5, mods: { fifteenVal: 3 } },
  { id: 'pair_pal', name: 'Pair Pal', desc: 'Your pairs in hand scoring are worth 3 instead of 2.', cost: 5, mods: { pairVal: 3 } },
  { id: 'run_baron', name: 'Run Baron', desc: '+2 points per run in your hand scoring.', cost: 4, mods: { runBonus: 2 } },
  { id: 'flush_broker', name: 'Flush Broker', desc: 'Your flushes score double.', cost: 4, mods: { flushMult: 2 } },
  { id: 'sir_nobs', name: 'Sir Nobs', desc: 'His Nobs scores 5 instead of 1 for you.', cost: 3, mods: { nobsVal: 5 } },
  { id: 'golden_crib', name: 'Golden Crib', desc: 'Your crib scores +50% (rounded up).', cost: 6, mods: { cribMult: 1.5 } },
  { id: 'overseer', name: 'The Overseer', desc: '+4 flat points to every hand you score (not crib).', cost: 6, mods: { handFlat: 4 } },
  { id: 'shortcut', name: 'Shortcut', desc: 'Your runs may hop over one missing rank (3·5·7 counts).', cost: 6, mods: { shortcut: true } },
  // per-card bonuses
  { id: 'five_alive', name: 'Five Alive', desc: '+2 points for each 5 in your scored hand.', cost: 4, mods: { rankBonus: { ranks: [5], pts: 2 } } },
  { id: 'jack_of_all', name: 'Jack of All', desc: '+2 points for each Jack in your scored hand.', cost: 3, mods: { rankBonus: { ranks: [11], pts: 2 } } },
  { id: 'even_steven', name: 'Even Steven', desc: '+1 point for each even card (2,4,6,8,10) in your scored hand.', cost: 4, mods: { rankBonus: { ranks: [2, 4, 6, 8, 10], pts: 1 } } },
  { id: 'odd_todd', name: 'Odd Todd', desc: '+1 point for each odd card (A,3,5,7,9) in your scored hand.', cost: 4, mods: { rankBonus: { ranks: [1, 3, 5, 7, 9], pts: 1 } } },
  { id: 'fibonacci', name: 'Fibonacci', desc: '+2 points for each A,2,3,5 or 8 in your scored hand.', cost: 5, mods: { rankBonus: { ranks: [1, 2, 3, 5, 8], pts: 2 } } },
  { id: 'walkie_talkie', name: 'Walkie Talkie', desc: '+2 points for each 10 or 4 in your scored hand.', cost: 4, mods: { rankBonus: { ranks: [10, 4], pts: 2 } } },
  { id: 'scary_face', name: 'Scary Face', desc: '+2 points for each face card in your scored hand.', cost: 4, mods: { rankBonus: { ranks: [11, 12, 13], pts: 2 } } },
  { id: 'greedy_joker', name: 'Greedy Joker', desc: '+1 point for each Diamond in your scored hand.', cost: 4, mods: { suitBonus: { suit: 1, pts: 1 } } },
  { id: 'lusty_joker', name: 'Lusty Joker', desc: '+1 point for each Heart in your scored hand.', cost: 4, mods: { suitBonus: { suit: 0, pts: 1 } } },
  { id: 'gluttonous_joker', name: 'Gluttonous Joker', desc: '+1 point for each Club in your scored hand.', cost: 4, mods: { suitBonus: { suit: 2, pts: 1 } } },
  { id: 'wrathful_joker', name: 'Wrathful Joker', desc: '+1 point for each Spade in your scored hand.', cost: 4, mods: { suitBonus: { suit: 3, pts: 1 } } },
  // conditional hand bonuses
  { id: 'nineteen', name: 'The Nineteen', desc: 'A hand worth nothing scores 19 instead. (There is no 19 hand in cribbage… until now.)', cost: 5, mods: { nineteen: true } },
  { id: 'skunk_line', name: 'Skunk Line', desc: '+5 points whenever your hand scores 12 or more.', cost: 5, mods: { bigHand: 5 } },
  { id: 'his_majesty', name: 'His Majesty', desc: '+4 to your hand when the starter is a face card.', cost: 4, mods: { starterFace: 4 } },
  { id: 'bull_market', name: 'Bull Market', desc: 'Hand scoring: +1 point per 4 coins you hold.', cost: 5, mods: { bull: 1 } },
  { id: 'muggins', name: 'Muggins', desc: '+2 points whenever an opponent\'s hand scores less than 4.', cost: 5, mods: { muggins: 2 } },
  // pegging
  { id: 'counter_king', name: 'Counter King', desc: 'All your pegging points are doubled.', cost: 6, mods: { pegMult: 2 } },
  { id: 'last_card_larry', name: 'Last Card Larry', desc: 'Your Go and Last Card score 3 instead of 1.', cost: 3, mods: { goVal: 3 } },
  { id: 'salute_31', name: '31 Salute', desc: 'Hitting exactly 31 scores 5 instead of 2 for you.', cost: 4, mods: { thirtyOneVal: 5 } },
  { id: 'pony_express', name: 'Pony Express', desc: 'Your first pegging card each deal scores +2.', cost: 3, mods: { pegFirst: 2 } },
  { id: 'small_ball', name: 'Small Ball', desc: '+1 point each time you peg a 2, 3, 4 or 5.', cost: 4, mods: { smallBall: 1 } },
  // economy
  { id: 'mugs_coin', name: "Mug's Coin", desc: '+2 coins after every deal.', cost: 5, mods: { coinsPerDeal: 2 } },
  { id: 'cutpurse', name: 'Cutpurse', desc: '+1 coin whenever a starter is cut.', cost: 3, mods: { coinOnCut: 1 } },
  { id: 'rocket', name: 'Rocket', desc: '+1 coin per deal for every blind you have passed.', cost: 5, mods: { coinPerBlind: 1 } },
  { id: 'heels_hunter', name: 'Heels Hunter', desc: 'His Heels (cutting a Jack as dealer) scores 5 instead of 2.', cost: 3, mods: { heelsVal: 5 } },
  // meta
  { id: 'blueprint', name: 'Blueprint', desc: 'Copies the ability of the joker to its right.', cost: 8, mods: {} },
];

// Tarots are one-shot consumables used during the discard phase. Card edits
// are PERMANENT — your hand is dealt from your own deck, and the deck remembers.
// `targets` = how many of your own hand cards must be selected, in order.
export const TAROTS = [
  { id: 'sun', name: 'The Sun', desc: "Permanently raise a card's rank by 1 (King wraps to Ace).", cost: 3, targets: 1 },
  { id: 'moon', name: 'The Moon', desc: "Permanently lower a card's rank by 1 (Ace wraps to King).", cost: 3, targets: 1 },
  { id: 'strength', name: 'Strength', desc: 'Permanently raise the rank of 2 chosen cards by 1.', cost: 4, targets: 2 },
  { id: 'death', name: 'Death', desc: 'Pick 2 cards: the first permanently becomes a copy of the second.', cost: 4, targets: 2 },
  { id: 'lovers', name: 'The Lovers', desc: 'Pick 2 cards: the first permanently takes the suit of the second.', cost: 3, targets: 2 },
  { id: 'justice', name: 'Justice', desc: 'A chosen card permanently becomes a 5 (keeps its suit).', cost: 4, targets: 1 },
  { id: 'star', name: 'The Star', desc: 'A chosen card permanently becomes a Jack (keeps its suit).', cost: 3, targets: 1 },
  { id: 'empress', name: 'The Empress', desc: '2 chosen cards permanently become Hearts.', cost: 3, targets: 2 },
  { id: 'emperor', name: 'The Emperor', desc: '2 chosen cards permanently become Diamonds.', cost: 3, targets: 2 },
  { id: 'devil', name: 'The Devil', desc: '2 chosen cards permanently become Clubs.', cost: 3, targets: 2 },
  { id: 'tower', name: 'The Tower', desc: '2 chosen cards permanently become Spades.', cost: 3, targets: 2 },
  { id: 'priestess', name: 'High Priestess', desc: 'Add a permanent copy of a chosen card to your deck.', cost: 4, targets: 1 },
  { id: 'hanged_man', name: 'The Hanged Man', desc: 'Destroy 2 chosen cards — removed from your deck forever.', cost: 4, targets: 2 },
  { id: 'judgement', name: 'Judgement', desc: 'Gain a random joker you do not own.', cost: 5, targets: 0 },
  { id: 'wheel', name: 'Wheel of Fortune', desc: 'Redraw your entire hand from your deck.', cost: 3, targets: 0 },
  { id: 'hermit', name: 'The Hermit', desc: 'Gain 5 coins.', cost: 2, targets: 0 },
];

export const PACKS = [
  { id: 'buffoon', name: 'Buffoon Pack', desc: 'Pick 1 of 3 jokers.', cost: 5, kind: 'pack' },
  { id: 'arcana', name: 'Arcana Pack', desc: 'Pick 1 of 3 tarot cards.', cost: 3, kind: 'pack' },
  { id: 'standard', name: 'Standard Pack', desc: 'Pick 1 of 3 playing cards to add to your deck.', cost: 3, kind: 'pack' },
];

export const JOKERS_BY_ID = Object.fromEntries(JOKERS.map(j => [j.id, j]));
export const TAROTS_BY_ID = Object.fromEntries(TAROTS.map(t => [t.id, t]));
export const PACKS_BY_ID = Object.fromEntries(PACKS.map(p => [p.id, p]));

const VAL_KEYS = ['fifteenVal', 'pairVal', 'nobsVal', 'goVal', 'thirtyOneVal', 'heelsVal'];
const FLAG_KEYS = ['shortcut', 'nineteen'];

// Blueprint copies the joker to its right: expand the owned list into the
// list of joker ids whose mods actually apply.
export function effectiveJokerIds(jokerIds) {
  const out = [];
  for (let i = 0; i < jokerIds.length; i++) {
    if (jokerIds[i] === 'blueprint') {
      const next = jokerIds[i + 1];
      if (next && next !== 'blueprint') out.push(next);
    } else {
      out.push(jokerIds[i]);
    }
  }
  return out;
}

export function aggregateMods(jokerIds) {
  const m = {
    fifteenVal: 2, pairVal: 2, runBonus: 0, flushMult: 1, nobsVal: 1,
    cribMult: 1, pegMult: 1, goVal: 1, thirtyOneVal: 2, heelsVal: 2,
    handFlat: 0, coinsPerDeal: 0, coinOnCut: 0, coinPerBlind: 0,
    rankBonuses: [], suitBonuses: [],
    shortcut: false, nineteen: false, muggins: 0, bigHand: 0,
    starterFace: 0, bull: 0, pegFirst: 0, smallBall: 0,
  };
  for (const id of effectiveJokerIds(jokerIds)) {
    const def = JOKERS_BY_ID[id];
    if (!def) continue;
    for (const [k, v] of Object.entries(def.mods)) {
      if (k === 'rankBonus') m.rankBonuses.push(v);
      else if (k === 'suitBonus') m.suitBonuses.push(v);
      else if (FLAG_KEYS.includes(k)) m[k] = m[k] || v;
      else if (k.endsWith('Mult')) m[k] *= v;
      else if (VAL_KEYS.includes(k)) m[k] = Math.max(m[k], v);
      else m[k] += v;
    }
  }
  return m;
}

const SUIT_NAMES = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];

// Total a scoring breakdown under a player's mods, producing the itemized
// lines shown in the reveal. ctx = { starter, coins }.
export function buildScore(bd, mods, kind, cards, ctx) {
  const J = ' 🃏';
  const lines = [];
  let total = 0;
  const add = (label, pts) => { lines.push({ label, pts }); total += pts; };

  if (bd.fifteens) add(`Fifteens ×${bd.fifteens}${mods.fifteenVal !== 2 ? J : ''}`, bd.fifteens * mods.fifteenVal);
  if (bd.pairs) add(`Pairs ×${bd.pairs}${mods.pairVal !== 2 ? J : ''}`, bd.pairs * mods.pairVal);
  if (bd.runPoints) add(`Runs${mods.runBonus || mods.shortcut ? J : ''}`, bd.runPoints + bd.runCount * mods.runBonus);
  if (bd.flush) add(`Flush${mods.flushMult !== 1 ? J : ''}`, bd.flush * mods.flushMult);
  if (bd.nobs) add(`His Nobs${mods.nobsVal !== 1 ? J : ''}`, bd.nobs * mods.nobsVal);

  const baseZero = !bd.fifteens && !bd.pairs && !bd.runPoints && !bd.flush && !bd.nobs;

  if (kind === 'crib') {
    if (mods.cribMult > 1) {
      const boosted = Math.ceil(total * mods.cribMult);
      lines.push({ label: `Golden Crib ×${mods.cribMult}${J}`, pts: null });
      total = boosted;
    }
    return { total, lines };
  }

  for (const rb of mods.rankBonuses) {
    const n = cards.filter(c => rb.ranks.includes(c.rank)).length;
    if (n) add(`Rank bonus ×${n}${J}`, n * rb.pts);
  }
  for (const sb of mods.suitBonuses) {
    const n = cards.filter(c => c.suit === sb.suit).length;
    if (n) add(`${SUIT_NAMES[sb.suit]} ×${n}${J}`, n * sb.pts);
  }
  if (mods.handFlat) add('Flat bonus' + J, mods.handFlat);
  if (mods.starterFace && ctx.starter && ctx.starter.rank >= 11) add('His Majesty' + J, mods.starterFace);
  if (mods.bull) {
    const pts = Math.floor((ctx.coins || 0) / 4) * mods.bull;
    if (pts) add('Bull Market' + J, pts);
  }
  if (mods.nineteen && baseZero) add('The Nineteen!' + J, 19);
  if (mods.bigHand && total >= 12) add('Skunk Line' + J, mods.bigHand);

  return { total, lines };
}

function pick(arr, n, exclude) {
  const pool = arr.filter(x => !exclude.includes(x.id));
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

export function randomJoker(ownedIds) {
  return pick(JOKERS, 1, ownedIds)[0] || null;
}

function shopItem(def, kind) {
  return { kind, id: def.id, name: def.name, desc: def.desc, cost: def.cost, sold: false };
}

export function makeShopOffer(player) {
  const jokers = pick(JOKERS, 2, player.jokers);
  const tarots = pick(TAROTS, 1, []);
  const packs = [PACKS[Math.floor(Math.random() * PACKS.length)]];
  return [
    ...jokers.map(j => shopItem(j, 'joker')),
    ...tarots.map(t => shopItem(t, 'tarot')),
    ...packs.map(p => shopItem(p, 'pack')),
  ];
}

export function openPack(type, player) {
  if (type === 'buffoon') {
    return pick(JOKERS, 3, player.jokers).map(j => ({ kind: 'joker', id: j.id, name: j.name, desc: j.desc }));
  }
  if (type === 'arcana') {
    return pick(TAROTS, 3, []).map(t => ({ kind: 'tarot', id: t.id, name: t.name, desc: t.desc }));
  }
  const cards = [];
  for (let i = 0; i < 3; i++) {
    const c = makeCard(1 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 4));
    cards.push({ kind: 'card', id: c.id, rank: c.rank, suit: c.suit });
  }
  return cards;
}
