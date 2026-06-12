import { cardValue } from './cards.js';

// Scores a kept hand (any size) plus starter. Returns raw counts so joker
// modifiers can reprice each category before totalling.
// `starter` may be null (bot discard heuristics evaluate the kept 4 alone)
export function scoreBreakdown(hand, starter, isCrib, opts = {}) {
  const all = starter ? hand.concat([starter]) : hand;
  const n = all.length;

  let fifteens = 0;
  for (let m = 1; m < (1 << n); m++) {
    let sum = 0, bits = 0;
    for (let i = 0; i < n; i++) {
      if (m & (1 << i)) { sum += cardValue(all[i].rank); bits++; }
    }
    if (bits >= 2 && sum === 15) fifteens++;
  }

  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (all[i].rank === all[j].rank) pairs++;
    }
  }

  const counts = new Array(14).fill(0);
  for (const c of all) counts[c.rank]++;
  let runPoints = 0, runCount = 0;
  let r = 1;
  while (r <= 13) {
    if (!counts[r]) { r++; continue; }
    let len = 0, mult = 1, last = r;
    while (r <= 13) {
      if (counts[r]) { len++; mult *= counts[r]; last = r; r++; }
      // Shortcut joker: a run may hop over a single missing rank (3·5·7)
      else if (opts.shortcut && r + 1 <= 13 && counts[r + 1] && r - last === 1) { r++; }
      else break;
    }
    if (len >= 3) { runPoints += len * mult; runCount += mult; }
  }

  let flush = 0;
  if (hand.length >= 4 && hand.every(c => c.suit === hand[0].suit)) {
    if (isCrib) {
      if (starter && starter.suit === hand[0].suit) flush = hand.length + 1;
    } else {
      flush = hand.length + (starter && starter.suit === hand[0].suit ? 1 : 0);
    }
  }

  let nobs = 0;
  if (starter) {
    for (const c of hand) {
      if (c.rank === 11 && c.suit === starter.suit) nobs++;
    }
  }

  return { fifteens, pairs, runPoints, runCount, flush, nobs };
}

// Pegging: events triggered by the newest card on the stack at the given count.
export function pegEvents(stack, count) {
  const events = [];
  if (count === 15) events.push({ type: 'fifteen', pts: 2 });

  let k = 1;
  const top = stack[stack.length - 1];
  for (let i = stack.length - 2; i >= 0; i--) {
    if (stack[i].rank === top.rank) k++; else break;
  }
  if (k >= 2) events.push({ type: 'pair', pts: k * (k - 1), size: k });

  for (let len = stack.length; len >= 3; len--) {
    const tail = stack.slice(stack.length - len).map(c => c.rank);
    const uniq = new Set(tail);
    if (uniq.size !== len) continue;
    if (Math.max(...tail) - Math.min(...tail) === len - 1) {
      events.push({ type: 'run', pts: len, size: len });
      break;
    }
  }

  if (count === 31) events.push({ type: 'thirtyone', pts: 2 });
  return events;
}
