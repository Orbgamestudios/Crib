export const SUITS = ['H', 'D', 'C', 'S'];
export const RANK_NAMES = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

let nextId = 1;

export function makeCard(rank, suit) {
  return { id: 'c' + (nextId++), rank, suit };
}

export function makeDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) {
      deck.push(makeCard(r, s));
    }
  }
  return deck;
}

export function sortedDeck(deck) {
  return deck.slice().sort((a, b) => a.suit - b.suit || a.rank - b.rank);
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
