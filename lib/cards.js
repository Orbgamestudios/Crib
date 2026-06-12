export const SUITS = ['H', 'D', 'C', 'S'];
export const RANK_NAMES = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

let nextId = 1;

export function makeDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) {
      deck.push({ id: 'c' + (nextId++), rank: r, suit: s });
    }
  }
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardValue(rank) {
  return Math.min(rank, 10);
}

export function cardName(card) {
  return RANK_NAMES[card.rank] + SUITS[card.suit];
}
