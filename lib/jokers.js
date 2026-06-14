import { makeCard } from './cards.js';

// Jokers are passive modifiers. `mods` keys are aggregated by aggregateMods:
//   *Mult keys multiply, *Val keys take the best value, flags OR, the rest add.
export const JOKERS = [
  // scoring repricers
  { id: 'fifteen_fanatic', name: 'Fifteen Fanatic', desc: 'Your fifteens score 3 instead of 2.', cost: 5, mods: { fifteenVal: 3 } },
  { id: 'pair_pal', name: 'Pair Pal', desc: 'Your pairs in hand scoring are worth 3 instead of 2.', cost: 5, mods: { pairVal: 3 } },
  { id: 'run_baron', name: 'Run Baron', desc: '+2 points per run in your hand scoring.', cost: 4, mods: { runBonus: 2 } },
  { id: 'flush_broker', name: 'Flush Broker', desc: 'Your flush scores double if the starter matches its suit.', cost: 4, mods: { flushStarterMult: 2 } },
  { id: 'sir_nobs', name: 'Sir Nobs', desc: 'His Nobs scores 5 instead of 1 for you.', cost: 3, mods: { nobsVal: 5 } },
  { id: 'golden_crib', name: 'Golden Crib', desc: 'Your crib gets +2 Mult if it contains a 5.', cost: 6, mods: { cribFiveMult: 2 } },
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
  { id: 'counter_king', name: 'Counter King', desc: 'Pegging points are doubled when your play leaves the count at 15 or higher.', cost: 6, mods: { pegHighCountMult: 2 } },
  { id: 'last_card_larry', name: 'Last Card Larry', desc: 'Your Go and Last Card score 3 instead of 1.', cost: 3, mods: { goVal: 3 } },
  { id: 'salute_31', name: '31 Salute', desc: 'Hitting exactly 31 scores 5 instead of 2 for you.', cost: 4, mods: { thirtyOneVal: 5 } },
  { id: 'pony_express', name: 'Pony Express', desc: 'Your first pegging card each deal scores +2.', cost: 3, mods: { pegFirst: 2 } },
  { id: 'small_ball', name: 'Small Ball', desc: '+1 point, not Mult, each time you peg a 2, 3, 4 or 5.', cost: 4, mods: { smallBall: 1 } },
  // economy
  { id: 'mugs_coin', name: "Mug's Coin", desc: '+2 coins after every deal.', cost: 5, mods: { coinsPerDeal: 2 } },
  { id: 'cutpurse', name: 'Cutpurse', desc: '+1 coin whenever a starter is cut.', cost: 3, mods: { coinOnCut: 1 } },
  { id: 'rocket', name: 'Rocket', desc: '+1 coin per deal for every blind you have passed.', cost: 5, mods: { coinPerBlind: 1 } },
  { id: 'heels_hunter', name: 'Heels Hunter', desc: 'His Heels (cutting a Jack as dealer) scores 5 instead of 2.', cost: 3, mods: { heelsVal: 5 } },
  { id: 'crib_copier', name: 'Crib Copier', desc: 'Each deal, copy the first card you discard into the crib.', cost: 7, mods: { duplicateFirstCrib: 1 } },
  { id: 'crib_battery', name: 'Crib Battery', desc: 'Your crib gets +2 Mult when its base score is 8 or less.', cost: 7, mods: { cribLeanMult: 2 } },
  { id: 'hayloft', name: 'Hayloft', desc: 'Your crib gets +1 Mult for every 2 cards in it.', cost: 7, mods: { cribPairMult: 1 } },
  { id: 'crib_spark', name: 'Crib Spark', desc: 'Your crib gets +1 Mult for each fifteen it contains.', cost: 6, mods: { cribFifteenMult: 1 } },
  { id: 'ace_chaser', name: 'Ace Chaser', desc: '+3 points for each Ace in your scored hand.', cost: 4, mods: { rankBonus: { ranks: [1], pts: 3 } } },
  { id: 'low_rider', name: 'Low Rider', desc: '+1 point for each A, 2 or 3 in your scored hand.', cost: 4, mods: { rankBonus: { ranks: [1, 2, 3], pts: 1 } } },
  { id: 'coin_clip', name: 'Coin Clip', desc: '+1 coin after every deal, plus +1 more per blind you have passed.', cost: 5, mods: { coinsPerDeal: 1, coinPerBlind: 1 } },
  // meta
  { id: 'blueprint', name: 'Blueprint', desc: 'Copies the ability of the joker to its right.', cost: 8, mods: {} },
  // ---- Ultra (the best jokers) ----
  { id: 'obelisk', name: 'Obelisk', desc: '+8 flat points to every hand you score (not crib).', cost: 8, mods: { handFlat: 8 } },
  { id: 'the_duo', name: 'The Duo', desc: 'Your pairs are worth 5 instead of 2.', cost: 8, mods: { pairVal: 5 } },
  { id: 'holo_fifteen', name: 'Holo Fifteen', desc: 'Your fifteens score 4 instead of 2.', cost: 8, mods: { fifteenVal: 4 } },
  { id: 'steel_crib', name: 'Steel Crib', desc: 'Your crib gets +3 Mult if it has no face cards.', cost: 8, mods: { cribNoFaceMult: 3 } },
  { id: 'overclock', name: 'Overclock', desc: 'Starting with your third pegging card each deal, pegging points are tripled.', cost: 8, mods: { pegAfterTwoMult: 3 } },
  { id: 'card_smith', name: 'Card Smith', desc: 'Open a free Standard Pack (add a card to your deck) every time you reach the shop.', cost: 8, mods: { freeStandardPack: 1 } },
  { id: 'crib_diviner', name: 'Crib Diviner', desc: 'When the cards you throw to the crib total 10 or more, gain a random tarot.', cost: 5, mods: { cribTenTarot: 1 } },
  { id: 'acemaker', name: 'Acemaker', desc: 'Every card you discard to the crib becomes an Ace.', cost: 8, mods: { cribAces: 1 } },
];

// Rarity tiers. Ultra are the strongest and always cost 8; rare are a notch
// up from common. Anything not listed is common. Rarity drives shop odds and
// the foil look of the tile.
const RARE_IDS = new Set([
  'fifteen_fanatic', 'pair_pal', 'golden_crib', 'overseer', 'shortcut', 'fibonacci',
  'nineteen', 'skunk_line', 'bull_market', 'muggins', 'counter_king', 'mugs_coin',
  'rocket', 'coin_clip', 'his_majesty', 'run_baron', 'flush_broker', 'crib_diviner', 'crib_spark',
]);
const ULTRA_IDS = new Set([
  'blueprint', 'crib_copier', 'crib_battery', 'hayloft', 'obelisk', 'the_duo', 'holo_fifteen', 'steel_crib', 'overclock', 'card_smith', 'acemaker',
]);
for (const j of JOKERS) {
  j.rarity = ULTRA_IDS.has(j.id) ? 'ultra' : RARE_IDS.has(j.id) ? 'rare' : 'common';
  if (j.rarity === 'ultra') j.cost = 8;
  else if (j.rarity === 'rare' && j.cost < 5) j.cost = 5;
}

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
  { id: 'violet_seal', name: 'Violet Seal', desc: 'Add a Purple Stamp to one owned joker.', cost: 5, targets: 0, jokerStamp: 'purple', rare: true },
  { id: 'scarlet_seal', name: 'Scarlet Seal', desc: 'Add a Red Stamp to one owned joker.', cost: 5, targets: 0, jokerStamp: 'red', rare: true },
  { id: 'ivory_seal', name: 'Ivory Seal', desc: 'Add a White Stamp to one owned joker.', cost: 5, targets: 0, jokerStamp: 'white', rare: true },
];

export const PACKS = [
  { id: 'buffoon', name: 'Buffoon Pack', desc: 'Pick 1 of 3 jokers.', cost: 5, kind: 'pack' },
  { id: 'arcana', name: 'Arcana Pack', desc: 'Pick 1 of 3 tarot cards.', cost: 3, kind: 'pack' },
  { id: 'standard', name: 'Standard Pack', desc: 'Pick 1 of 3 playing cards to add to your deck.', cost: 3, kind: 'pack' },
];

export const JOKERS_BY_ID = Object.fromEntries(JOKERS.map(j => [j.id, j]));
export const TAROTS_BY_ID = Object.fromEntries(TAROTS.map(t => [t.id, t]));
export const PACKS_BY_ID = Object.fromEntries(PACKS.map(p => [p.id, p]));

export const STAMPS = {
  purple: { name: 'Purple Stamp', desc: 'This joker can also help crib scoring when its effect fits.', chance: 0.03 },
  white: { name: 'White Stamp', desc: 'Adds +1 joker slot while owned.', chance: 0.015 },
  red: { name: 'Red Stamp', desc: '+1 Mult during scoring.', chance: 0.03 },
  blue: { name: 'Blue Stamp', desc: '+2 hand points during scoring.', chance: 0.03 },
};

function normalizeStamp(stamp) {
  if (stamp === 'green') return 'blue';
  if (stamp === 'blue') return 'white';
  return stamp;
}

export function jokerId(joker) {
  return typeof joker === 'string' ? joker : joker && joker.id;
}

export function normalizeJoker(joker) {
  if (typeof joker === 'string') return { id: joker };
  if (joker && joker.id) {
    const stamp = normalizeStamp(joker.stamp);
    return { id: joker.id, ...(stamp ? { stamp } : {}) };
  }
  return null;
}

export function jokerDef(joker) {
  return JOKERS_BY_ID[jokerId(joker)];
}

function rollStamp() {
  const roll = Math.random();
  let mark = 0;
  for (const [stamp, meta] of Object.entries(STAMPS)) {
    mark += meta.chance;
    if (roll < mark) return stamp;
  }
  return null;
}

export function jokerInstance(def, stamped = true) {
  const inst = { id: def.id };
  const stamp = stamped ? rollStamp() : null;
  if (stamp) inst.stamp = stamp;
  return inst;
}

export function jokerCapacity(jokers, base = 5) {
  return base + (jokers || []).filter(j => normalizeJoker(j)?.stamp === 'white').length;
}

export function stampText(stamp) {
  return stamp && STAMPS[stamp] ? `${STAMPS[stamp].name}: ${STAMPS[stamp].desc}` : '';
}

const VAL_KEYS = ['fifteenVal', 'pairVal', 'nobsVal', 'goVal', 'thirtyOneVal', 'heelsVal'];
const FLAG_KEYS = ['shortcut', 'nineteen'];

// Blueprint copies the joker to its right: expand the owned list into the
// list of joker ids whose mods actually apply.
export function effectiveJokerIds(jokerIds) {
  const out = [];
  for (let i = 0; i < jokerIds.length; i++) {
    const id = jokerId(jokerIds[i]);
    if (id === 'blueprint') {
      const next = jokerIds[i + 1];
      if (next && jokerId(next) !== 'blueprint') out.push(next);
    } else {
      out.push(jokerIds[i]);
    }
  }
  return out;
}

export function aggregateMods(jokerIds) {
  const m = {
    fifteenVal: 2, pairVal: 2, runBonus: 0, flushMult: 1, flushStarterMult: 1, nobsVal: 1,
    cribMult: 1, pegMult: 1, pegHighCountMult: 1, pegAfterTwoMult: 1, goVal: 1, thirtyOneVal: 2, heelsVal: 2,
    handFlat: 0, coinsPerDeal: 0, coinOnCut: 0, coinPerBlind: 0,
    rankBonuses: [], suitBonuses: [],
    shortcut: false, nineteen: false, muggins: 0, bigHand: 0,
    starterFace: 0, bull: 0, pegFirst: 0, smallBall: 0, duplicateFirstCrib: 0,
    cribTenTarot: 0, freeStandardPack: 0, cribAces: 0,
    cribScoreMult: 1, cribPairMult: 0, cribFifteenMult: 0,
    cribFiveMult: 0, cribLeanMult: 0, cribNoFaceMult: 0,
    stampRedMult: 0, stampGreenPoints: 0, stampPurpleCrib: false, stampBlueSlots: 0,
  };
  for (const raw of jokerIds || []) {
    const j = normalizeJoker(raw);
    if (!j || !j.stamp) continue;
    if (j.stamp === 'red') m.stampRedMult += 1;
    else if (j.stamp === 'blue') m.stampGreenPoints += 2;
    else if (j.stamp === 'purple') m.stampPurpleCrib = true;
    else if (j.stamp === 'white') m.stampBlueSlots += 1;
  }
  for (const id of effectiveJokerIds(jokerIds)) {
    const def = jokerDef(id);
    if (!def) continue;
    for (const [k, v] of Object.entries(def.mods)) {
      if (k === 'rankBonus') m.rankBonuses.push(v);
      else if (k === 'suitBonus') m.suitBonuses.push(v);
      else if (k === 'cribPairMult' || k === 'cribFifteenMult' || k === 'cribFiveMult' || k === 'cribLeanMult' || k === 'cribNoFaceMult') m[k] += v;
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
  const J = ' [Joker]';
  const lines = [];
  let total = 0;
  const add = (label, pts) => { lines.push({ label, pts }); total += pts; };

  if (bd.fifteens) add(`Fifteens ×${bd.fifteens}${mods.fifteenVal !== 2 ? J : ''}`, bd.fifteens * mods.fifteenVal);
  if (bd.pairs) add(`Pairs ×${bd.pairs}${mods.pairVal !== 2 ? J : ''}`, bd.pairs * mods.pairVal);
  if (bd.runPoints) add(`Runs${mods.runBonus || mods.shortcut ? J : ''}`, bd.runPoints + bd.runCount * mods.runBonus);
  if (bd.flush) {
    let flushMult = mods.flushMult;
    if (mods.flushStarterMult !== 1 && ctx.starter && cards.length && cards.every(c => c.suit === cards[0].suit) && ctx.starter.suit === cards[0].suit) {
      flushMult *= mods.flushStarterMult;
    }
    add(`Flush${flushMult !== 1 ? J : ''}`, bd.flush * flushMult);
  }
  if (bd.nobs) add(`His Nobs${mods.nobsVal !== 1 ? J : ''}`, bd.nobs * mods.nobsVal);

  const baseZero = !bd.fifteens && !bd.pairs && !bd.runPoints && !bd.flush && !bd.nobs;

  if (kind === 'crib' && !mods.stampPurpleCrib) {
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
  if (kind === 'hand' && mods.stampGreenPoints) add('Blue Stamp' + J, mods.stampGreenPoints);
  if (mods.starterFace && ctx.starter && ctx.starter.rank >= 11) add('His Majesty' + J, mods.starterFace);
  if (mods.bull) {
    const pts = Math.floor((ctx.coins || 0) / 4) * mods.bull;
    if (pts) add('Bull Market' + J, pts);
  }
  if (mods.nineteen && baseZero) add('The Nineteen!' + J, 19);
  if (mods.bigHand && total >= 12) add('Skunk Line' + J, mods.bigHand);
  if (kind === 'crib' && mods.cribMult > 1) {
    const boosted = Math.ceil(total * mods.cribMult);
    lines.push({ label: `Golden Crib ×${mods.cribMult}${J}`, pts: null });
    total = boosted;
  }

  return { total, lines };
}

function pick(arr, n, exclude) {
  const excludeIds = exclude.map(jokerId);
  const pool = arr.filter(x => !excludeIds.includes(x.id));
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// Jokers are drawn by rarity weight so Ultras stay a rare thrill.
const RARITY_WEIGHT = { common: 70, rare: 26, ultra: 6 };
function pickJokers(n, exclude) {
  const excludeIds = (exclude || []).map(jokerId);
  const pool = JOKERS.filter(j => !excludeIds.includes(j.id));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, j) => s + (RARITY_WEIGHT[j.rarity] || 1), 0);
    let r = Math.random() * total, idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { r -= RARITY_WEIGHT[pool[i].rarity] || 1; if (r <= 0) { idx = i; break; } }
    out.push(jokerInstance(pool.splice(idx, 1)[0]));
  }
  return out;
}

export function randomJoker(ownedIds) {
  return pickJokers(1, ownedIds)[0] || null;
}

export function randomTarot() {
  const pool = TAROTS.flatMap(t => Array(t.rare ? 1 : 6).fill(t));
  return pool[Math.floor(Math.random() * pool.length)];
}

function shopItem(def, kind) {
  const id = jokerId(def);
  const base = kind === 'joker' ? JOKERS_BY_ID[id] : def;
  const item = { kind, id: base.id, name: base.name, desc: base.desc, cost: base.cost, sold: false };
  if (kind === 'joker') {
    item.rarity = base.rarity;
    const stamp = normalizeJoker(def)?.stamp;
    if (stamp) item.stamp = stamp;
  } else if (kind === 'tarot') {
    if (base.jokerStamp) item.jokerStamp = base.jokerStamp;
    if (base.rare) item.rare = true;
  }
  return item;
}

function wildcardItem(player, excludeJokers) {
  const roll = Math.floor(Math.random() * 2);
  if (roll === 0) {
    const joker = pickJokers(1, excludeJokers)[0];
    if (joker) return shopItem(joker, 'joker');
  }
  return shopItem(randomTarot(), 'tarot');
}

export function makeShopOffer(player) {
  const jokers = pickJokers(2, player.jokers);
  const tarots = [randomTarot()];
  const packs = [
    PACKS[Math.floor(Math.random() * PACKS.length)],
    PACKS[Math.floor(Math.random() * PACKS.length)],
  ];
  return [
    ...jokers.map(j => shopItem(j, 'joker')),
    ...tarots.map(t => shopItem(t, 'tarot')),
    wildcardItem(player, player.jokers.concat(jokers.map(j => j.id))),
    ...packs.map(p => shopItem(p, 'pack')),
  ];
}

export function openPack(type, player) {
  if (type === 'buffoon') {
    return pickJokers(3, player.jokers).map(j => {
      const def = JOKERS_BY_ID[j.id];
      return { kind: 'joker', id: j.id, stamp: j.stamp, name: def.name, desc: def.desc, rarity: def.rarity };
    });
  }
  if (type === 'arcana') {
    const out = [];
    while (out.length < 3) {
      const t = randomTarot();
      if (!out.some(x => x.id === t.id)) out.push(t);
    }
    return out.map(t => ({ kind: 'tarot', id: t.id, name: t.name, desc: t.desc, jokerStamp: t.jokerStamp, rare: !!t.rare }));
  }
  const cards = [];
  for (let i = 0; i < 3; i++) {
    const c = makeCard(1 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 4));
    cards.push({ kind: 'card', id: c.id, rank: c.rank, suit: c.suit });
  }
  return cards;
}
