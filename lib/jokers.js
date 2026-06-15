import { makeCard } from './cards.js';

// Jokers are passive modifiers. `mods` keys are aggregated by aggregateMods:
//   *Mult keys multiply, *Val keys take the best value, flags OR, the rest add.
export const JOKERS = [
  // scoring repricers
  { id: 'fifteen_fanatic', name: 'Fifteen Fanatic', desc: 'During hand or crib scoring, every combo that totals 15 is worth 3 points instead of the normal 2.', cost: 5, mods: { fifteenVal: 3 } },
  { id: 'pair_pal', name: 'Pair Pal', desc: 'During hand or crib scoring, every pair you score is worth 3 points instead of the normal 2.', cost: 5, mods: { pairVal: 3 } },
  { id: 'run_baron', name: 'Run Baron', desc: 'Whenever your scored hand contains a run, add +2 extra points for each separate run counted.', cost: 4, mods: { runBonus: 2 } },
  { id: 'flush_broker', name: 'Flush Broker', desc: 'If your hand is a flush and the starter card is the same suit, double the flush points.', cost: 4, mods: { flushStarterMult: 2 } },
  { id: 'sir_nobs', name: 'Sir Nobs', desc: 'If you score His Nobs, the matching-suit Jack is worth 5 points instead of 1.', cost: 3, mods: { nobsVal: 5 } },
  { id: 'golden_crib', name: 'Golden Crib', desc: 'When your crib is scored, gain +2 crib Mult if any card in the crib is a 5.', cost: 6, mods: { cribFiveMult: 2 } },
  { id: 'overseer', name: 'The Overseer', desc: 'Add +4 flat points every time one of your regular hands scores. This does not affect your crib.', cost: 6, mods: { handFlat: 4 } },
  { id: 'shortcut', name: 'Shortcut', desc: 'Your runs can skip one missing rank, so patterns like 3-5-7 can count as a run.', cost: 6, mods: { shortcut: true } },
  // per-card bonuses
  { id: 'five_alive', name: 'Five Alive', desc: 'When your regular hand scores, each 5 in those scoring cards adds +2 extra points.', cost: 4, mods: { rankBonus: { ranks: [5], pts: 2 } } },
  { id: 'jack_of_all', name: 'Jack of All', desc: 'When your regular hand scores, each Jack in those scoring cards adds +2 extra points.', cost: 3, mods: { rankBonus: { ranks: [11], pts: 2 } } },
  { id: 'even_steven', name: 'Even Steven', desc: 'When your regular hand scores, each 2, 4, 6, 8, or 10 adds +1 extra point.', cost: 4, mods: { rankBonus: { ranks: [2, 4, 6, 8, 10], pts: 1 } } },
  { id: 'odd_todd', name: 'Odd Todd', desc: 'When your regular hand scores, each Ace, 3, 5, 7, or 9 adds +1 extra point.', cost: 4, mods: { rankBonus: { ranks: [1, 3, 5, 7, 9], pts: 1 } } },
  { id: 'fibonacci', name: 'Fibonacci', desc: 'When your regular hand scores, each Ace, 2, 3, 5, or 8 adds +2 extra points.', cost: 5, mods: { rankBonus: { ranks: [1, 2, 3, 5, 8], pts: 2 } } },
  { id: 'walkie_talkie', name: 'Walkie Talkie', desc: 'When your regular hand scores, each 10 or 4 adds +2 extra points.', cost: 4, mods: { rankBonus: { ranks: [10, 4], pts: 2 } } },
  { id: 'scary_face', name: 'Scary Face', desc: 'When your regular hand scores, each Jack, Queen, or King adds +2 extra points.', cost: 4, mods: { rankBonus: { ranks: [11, 12, 13], pts: 2 } } },
  { id: 'greedy_joker', name: 'Greedy Joker', desc: 'When your regular hand scores, each Diamond adds +1 extra point.', cost: 4, mods: { suitBonus: { suit: 1, pts: 1 } } },
  { id: 'lusty_joker', name: 'Lusty Joker', desc: 'When your regular hand scores, each Heart adds +1 extra point.', cost: 4, mods: { suitBonus: { suit: 0, pts: 1 } } },
  { id: 'gluttonous_joker', name: 'Gluttonous Joker', desc: 'When your regular hand scores, each Club adds +1 extra point.', cost: 4, mods: { suitBonus: { suit: 2, pts: 1 } } },
  { id: 'wrathful_joker', name: 'Wrathful Joker', desc: 'When your regular hand scores, each Spade adds +1 extra point.', cost: 4, mods: { suitBonus: { suit: 3, pts: 1 } } },
  // conditional hand bonuses
  { id: 'nineteen', name: 'The Nineteen', desc: 'If one of your regular hands would score 0 points, it scores 19 instead.', cost: 5, mods: { nineteen: true } },
  { id: 'skunk_line', name: 'Skunk Line', desc: 'After your regular hand total is counted, add +5 points if that hand reached 12 or more.', cost: 5, mods: { bigHand: 5 } },
  { id: 'his_majesty', name: 'His Majesty', desc: 'When the starter card is a Jack, Queen, or King, add +4 points to your regular hand.', cost: 4, mods: { starterFace: 4 } },
  { id: 'bull_market', name: 'Bull Market', desc: 'When your regular hand scores, add +1 point for every 4 coins you currently have.', cost: 5, mods: { bull: 1 } },
  { id: 'muggins', name: 'Muggins', desc: 'When an opponent scores a regular hand for less than 4 points, you gain +2 points.', cost: 5, mods: { muggins: 2 } },
  // pegging
  { id: 'counter_king', name: 'Counter King', desc: 'During pegging, if your play scores Mult and leaves the count above 15, gain +2 bonus Mult.', cost: 6, mods: {} },
  { id: 'last_card_larry', name: 'Last Card Larry', desc: 'During pegging, when you score Go or Last Card, score 3 pegging points instead of 1.', cost: 3, mods: { goVal: 3 } },
  { id: 'salute_31', name: '31 Salute', desc: 'During pegging, if you hit exactly 31, score 5 pegging points instead of 2.', cost: 4, mods: { thirtyOneVal: 5 } },
  { id: 'pony_express', name: 'Pony Express', desc: 'During each deal, your first card played in pegging scores +2 extra pegging points.', cost: 3, mods: { pegFirst: 2 } },
  { id: 'small_ball', name: 'Small Ball', desc: 'During pegging, each time you play a 2, 3, 4, or 5, score +1 extra pegging point.', cost: 4, mods: { smallBall: 1 } },
  // economy
  { id: 'mugs_coin', name: "Mug's Coin", desc: 'After every deal ends, gain +2 extra coins before you shop.', cost: 5, mods: { coinsPerDeal: 2 } },
  { id: 'cutpurse', name: 'Cutpurse', desc: 'Each time the starter card is cut, gain +1 coin immediately.', cost: 3, mods: { coinOnCut: 1 } },
  { id: 'rocket', name: 'Rocket', desc: 'After each deal, gain +1 coin for each blind you have already passed.', cost: 5, mods: { coinPerBlind: 1 } },
  { id: 'heels_hunter', name: 'Heels Hunter', desc: 'When you are dealer and the starter is a Jack, His Heels scores 5 points instead of 2.', cost: 3, mods: { heelsVal: 5 } },
  { id: 'crib_copier', name: 'Crib Copier', desc: 'At the start of each deal, the first card you discard to the crib is duplicated into that crib and added to your deck for the run.', cost: 7, mods: { duplicateFirstCrib: 1 } },
  { id: 'crib_battery', name: 'Crib Battery', desc: 'When your crib scores, its crib Mult is multiplied by x1.25 for each different suit in the crib.', cost: 7, mods: { cribSuitMult: 1.25 } },
  { id: 'hayloft', name: 'Hayloft', desc: 'When your crib scores, gain +1 crib Mult for every 2 cards in that crib.', cost: 7, mods: { cribPairMult: 1 } },
  { id: 'crib_spark', name: 'Crib Spark', desc: 'When your crib scores, gain +1 crib Mult for each fifteen combo inside the crib.', cost: 6, mods: { cribFifteenMult: 1 } },
  { id: 'ace_chaser', name: 'Ace Chaser', desc: 'When your regular hand scores, each Ace adds +3 extra points.', cost: 4, mods: { rankBonus: { ranks: [1], pts: 3 } } },
  { id: 'low_rider', name: 'Low Rider', desc: 'When your regular hand scores, each Ace, 2, or 3 adds +1 extra point.', cost: 4, mods: { rankBonus: { ranks: [1, 2, 3], pts: 1 } } },
  { id: 'coin_clip', name: 'Coin Clip', desc: 'After every deal, gain +1 coin, plus +1 more coin for each blind you have already passed.', cost: 5, mods: { coinsPerDeal: 1, coinPerBlind: 1 } },
  // meta
  { id: 'blueprint', name: 'Blueprint', desc: 'Copies the joker immediately to its right. Drag your jokers to choose what Blueprint copies.', cost: 8, mods: {} },
  // ---- Ultra (the best jokers) ----
  { id: 'obelisk', name: 'Obelisk', desc: 'Add +8 flat points every time one of your regular hands scores. This does not affect your crib.', cost: 8, mods: { handFlat: 8 } },
  { id: 'the_duo', name: 'The Duo', desc: 'During hand or crib scoring, every pair you score is worth 5 points instead of the normal 2.', cost: 8, mods: { pairVal: 5 } },
  { id: 'holo_fifteen', name: 'Holo Fifteen', desc: 'During hand or crib scoring, every fifteen combo is worth 4 points instead of the normal 2.', cost: 8, mods: { fifteenVal: 4 } },
  { id: 'steel_crib', name: 'Steel Crib', desc: 'When your crib scores, gain +3 crib Mult if the crib has no Jacks, Queens, or Kings.', cost: 8, mods: { cribNoFaceMult: 3 } },
  { id: 'overclock', name: 'Overclock', desc: 'During pegging, starting with your third played card each deal, any pegging points you score are tripled.', cost: 8, mods: { pegAfterTwoMult: 3 } },
  { id: 'card_smith', name: 'Card Smith', desc: 'Each time you reach the shop, open one free Standard Pack and choose a card to add to your deck.', cost: 6, mods: { freeStandardPack: 1 } },
  { id: 'crib_diviner', name: 'Crib Diviner', desc: 'During discard, if the cards you send to the crib total 10 or more, gain a random tarot if you have room.', cost: 5, mods: { cribTenTarot: 1 } },
  { id: 'acemaker', name: 'Acemaker', desc: 'Whenever you discard cards to the crib, those discarded cards become Aces before entering the crib.', cost: 8, mods: { cribAces: 1 } },
];

// Rarity tiers. Ultra are the strongest and always cost 8; rare are a notch
// up from common. Anything not listed is common. Rarity drives shop odds and
// the foil look of the tile.
const RARE_IDS = new Set([
  'fifteen_fanatic', 'pair_pal', 'golden_crib', 'overseer', 'shortcut', 'fibonacci',
  'nineteen', 'skunk_line', 'bull_market', 'muggins', 'counter_king', 'mugs_coin',
  'rocket', 'coin_clip', 'his_majesty', 'run_baron', 'flush_broker', 'crib_diviner', 'crib_spark', 'card_smith',
]);
const ULTRA_IDS = new Set([
  'blueprint', 'crib_copier', 'crib_battery', 'hayloft', 'obelisk', 'the_duo', 'holo_fifteen', 'steel_crib', 'overclock', 'acemaker',
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
  { id: 'sun', name: 'The Sun', desc: 'Use during discard on one card in your hand. That card permanently ranks up by 1 in your deck; King wraps to Ace.', cost: 3, targets: 1 },
  { id: 'moon', name: 'The Moon', desc: 'Use during discard on one card in your hand. That card permanently ranks down by 1 in your deck; Ace wraps to King.', cost: 3, targets: 1 },
  { id: 'strength', name: 'Strength', desc: 'Use during discard on two cards in your hand. Both cards permanently rank up by 1 in your deck.', cost: 4, targets: 2 },
  { id: 'death', name: 'Death', desc: 'Use during discard on two cards in your hand. The first selected card permanently becomes an exact copy of the second.', cost: 4, targets: 2 },
  { id: 'lovers', name: 'The Lovers', desc: 'Use during discard on two cards in your hand. The first selected card permanently changes to the second card\'s suit.', cost: 3, targets: 2 },
  { id: 'justice', name: 'Justice', desc: 'Use during discard on one card in your hand. It permanently becomes a 5 and keeps its current suit.', cost: 4, targets: 1 },
  { id: 'star', name: 'The Star', desc: 'Use during discard on one card in your hand. It permanently becomes a Jack and keeps its current suit.', cost: 3, targets: 1 },
  { id: 'empress', name: 'The Empress', desc: 'Use during discard on two cards in your hand. Both permanently become Hearts.', cost: 3, targets: 2 },
  { id: 'emperor', name: 'The Emperor', desc: 'Use during discard on two cards in your hand. Both permanently become Diamonds.', cost: 3, targets: 2 },
  { id: 'devil', name: 'The Devil', desc: 'Use during discard on two cards in your hand. Both permanently become Clubs.', cost: 3, targets: 2 },
  { id: 'tower', name: 'The Tower', desc: 'Use during discard on two cards in your hand. Both permanently become Spades.', cost: 3, targets: 2 },
  { id: 'priestess', name: 'High Priestess', desc: 'Use during discard on one card in your hand. A permanent copy of that exact card is added to your deck.', cost: 4, targets: 1 },
  { id: 'hanged_man', name: 'The Hanged Man', desc: 'Use during discard on two cards in your hand. Both are permanently removed from your deck after use.', cost: 4, targets: 2 },
  { id: 'judgement', name: 'Judgement', desc: 'Use in the shop or during discard. Gain one random joker you do not already own, if you have room.', cost: 5, targets: 0 },
  { id: 'wheel', name: 'Wheel of Fortune', desc: 'Use during discard before choosing crib cards. Your whole hand is redrawn from your deck.', cost: 3, targets: 0 },
  { id: 'hermit', name: 'The Hermit', desc: 'Use in the shop or during discard. Gain 5 coins immediately.', cost: 2, targets: 0 },
  { id: 'violet_seal', name: 'Violet Seal', desc: 'Use on one owned joker that has no stamp. It adds a Purple Stamp, letting that joker help crib scoring when applicable.', cost: 5, targets: 0, jokerStamp: 'purple', rare: true },
  { id: 'scarlet_seal', name: 'Scarlet Seal', desc: 'Use on one owned joker that has no stamp. It adds a Red Stamp, giving +1 Mult during scoring.', cost: 5, targets: 0, jokerStamp: 'red', rare: true },
  { id: 'azure_seal', name: 'Azure Seal', desc: 'Use on one owned joker that has no stamp. It adds a Blue Stamp, giving +2 hand points during scoring.', cost: 5, targets: 0, jokerStamp: 'blue', rare: true },
];

export const PACKS = [
  { id: 'buffoon', name: 'Buffoon Pack', desc: 'Pick 1 of 3 jokers.', cost: 5, kind: 'pack' },
  { id: 'arcana', name: 'Arcana Pack', desc: 'Pick 1 of 3 tarot cards.', cost: 3, kind: 'pack' },
  { id: 'standard', name: 'Standard Pack', desc: 'Pick 1 of 3 playing cards to add to your deck.', cost: 3, kind: 'pack' },
];

export const JOKERS_BY_ID = Object.fromEntries(JOKERS.map(j => [j.id, j]));
export const TAROTS_BY_ID = Object.fromEntries(TAROTS.map(t => [t.id, t]));
TAROTS_BY_ID.ivory_seal = TAROTS_BY_ID.azure_seal;
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
    cribFiveMult: 0, cribLeanMult: 0, cribNoFaceMult: 0, cribSuitMult: 1,
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
