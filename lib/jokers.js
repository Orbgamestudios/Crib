// Jokers are passive modifiers. `mods` keys are aggregated by aggregateMods:
//   *Mult keys multiply, *Val keys take the best value, the rest add.
export const JOKERS = [
  { id: 'fifteen_fanatic', name: 'Fifteen Fanatic', desc: 'Your fifteens score 3 instead of 2.', cost: 5, mods: { fifteenVal: 3 } },
  { id: 'pair_pal', name: 'Pair Pal', desc: 'Your pairs in hand scoring are worth 3 instead of 2.', cost: 5, mods: { pairVal: 3 } },
  { id: 'run_baron', name: 'Run Baron', desc: '+2 points per run in your hand scoring.', cost: 4, mods: { runBonus: 2 } },
  { id: 'flush_broker', name: 'Flush Broker', desc: 'Your flushes score double.', cost: 4, mods: { flushMult: 2 } },
  { id: 'sir_nobs', name: 'Sir Nobs', desc: 'His Nobs scores 5 instead of 1 for you.', cost: 3, mods: { nobsVal: 5 } },
  { id: 'golden_crib', name: 'Golden Crib', desc: 'Your crib scores +50% (rounded up).', cost: 6, mods: { cribMult: 1.5 } },
  { id: 'counter_king', name: 'Counter King', desc: 'All your pegging points are doubled.', cost: 6, mods: { pegMult: 2 } },
  { id: 'last_card_larry', name: 'Last Card Larry', desc: 'Your Go and Last Card score 3 instead of 1.', cost: 3, mods: { goVal: 3 } },
  { id: 'five_alive', name: 'Five Alive', desc: '+2 points for each 5 in your scored hand.', cost: 4, mods: { rankBonus: { rank: 5, pts: 2 } } },
  { id: 'jack_of_all', name: 'Jack of All', desc: '+2 points for each Jack in your scored hand.', cost: 3, mods: { rankBonus: { rank: 11, pts: 2 } } },
  { id: 'salute_31', name: '31 Salute', desc: 'Hitting exactly 31 scores 5 instead of 2 for you.', cost: 4, mods: { thirtyOneVal: 5 } },
  { id: 'overseer', name: 'The Overseer', desc: '+4 flat points to every hand you score (not crib).', cost: 6, mods: { handFlat: 4 } },
  { id: 'mugs_coin', name: "Mug's Coin", desc: '+2 coins after every deal.', cost: 5, mods: { coinsPerDeal: 2 } },
  { id: 'cutpurse', name: 'Cutpurse', desc: '+1 coin whenever a starter is cut.', cost: 3, mods: { coinOnCut: 1 } },
  { id: 'heels_hunter', name: 'Heels Hunter', desc: 'His Heels (cutting a Jack as dealer) scores 5 instead of 2.', cost: 3, mods: { heelsVal: 5 } },
];

// Tarots are one-shot consumables used during the discard phase.
// `targets` = how many of your own hand cards must be selected, in order.
export const TAROTS = [
  { id: 'sun', name: 'The Sun', desc: "Raise a card's rank by 1 (King wraps to Ace).", cost: 3, targets: 1 },
  { id: 'moon', name: 'The Moon', desc: "Lower a card's rank by 1 (Ace wraps to King).", cost: 3, targets: 1 },
  { id: 'death', name: 'Death', desc: 'Pick 2 cards: the first becomes a copy of the second.', cost: 4, targets: 2 },
  { id: 'lovers', name: 'The Lovers', desc: 'Pick 2 cards: the first takes the suit of the second.', cost: 3, targets: 2 },
  { id: 'justice', name: 'Justice', desc: 'A chosen card becomes a 5 (keeps its suit).', cost: 4, targets: 1 },
  { id: 'star', name: 'The Star', desc: 'A chosen card becomes a Jack (keeps its suit).', cost: 3, targets: 1 },
  { id: 'wheel', name: 'Wheel of Fortune', desc: 'Redraw your entire hand from the deck.', cost: 3, targets: 0 },
  { id: 'hermit', name: 'The Hermit', desc: 'Gain 5 coins.', cost: 2, targets: 0 },
];

export const JOKERS_BY_ID = Object.fromEntries(JOKERS.map(j => [j.id, j]));
export const TAROTS_BY_ID = Object.fromEntries(TAROTS.map(t => [t.id, t]));

const VAL_KEYS = ['fifteenVal', 'pairVal', 'nobsVal', 'goVal', 'thirtyOneVal', 'heelsVal'];

export function aggregateMods(jokerIds) {
  const m = {
    fifteenVal: 2, pairVal: 2, runBonus: 0, flushMult: 1, nobsVal: 1,
    cribMult: 1, pegMult: 1, goVal: 1, thirtyOneVal: 2, heelsVal: 2,
    handFlat: 0, coinsPerDeal: 0, coinOnCut: 0, rankBonuses: [],
  };
  for (const id of jokerIds) {
    const def = JOKERS_BY_ID[id];
    if (!def) continue;
    for (const [k, v] of Object.entries(def.mods)) {
      if (k === 'rankBonus') m.rankBonuses.push(v);
      else if (k.endsWith('Mult')) m[k] *= v;
      else if (VAL_KEYS.includes(k)) m[k] = Math.max(m[k], v);
      else m[k] += v;
    }
  }
  return m;
}

// Total a scoring breakdown under a player's mods.
export function applyMods(bd, mods, isCrib, handCards) {
  let total =
    bd.fifteens * mods.fifteenVal +
    bd.pairs * mods.pairVal +
    bd.runPoints + bd.runCount * mods.runBonus +
    bd.flush * mods.flushMult +
    bd.nobs * mods.nobsVal;
  if (!isCrib) {
    for (const rb of mods.rankBonuses) {
      total += handCards.filter(c => c.rank === rb.rank).length * rb.pts;
    }
    total += mods.handFlat;
  } else {
    total = Math.ceil(total * mods.cribMult);
  }
  return total;
}

function pick(arr, n, exclude) {
  const pool = arr.filter(x => !exclude.includes(x.id));
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

export function makeShopOffer(player) {
  const jokers = pick(JOKERS, 2, player.jokers);
  const tarots = pick(TAROTS, 2, []);
  return [
    ...jokers.map(j => ({ kind: 'joker', id: j.id, name: j.name, desc: j.desc, cost: j.cost, sold: false })),
    ...tarots.map(t => ({ kind: 'tarot', id: t.id, name: t.name, desc: t.desc, cost: t.cost, sold: false })),
  ];
}
