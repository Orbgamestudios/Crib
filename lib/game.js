import { makeDeck, makeCard, sortedDeck, shuffle, cardValue, cardName } from './cards.js';
import { scoreBreakdown, pegEvents } from './scoring.js';
import {
  JOKERS_BY_ID, TAROTS_BY_ID, PACKS_BY_ID,
  aggregateMods, buildScore, makeShopOffer, openPack, randomJoker,
} from './jokers.js';

// smoke tests: collapse all pacing (browser has no `process`)
const FAST = typeof process !== 'undefined' && !!(process.env && process.env.CRIB_FAST);
const STARTING_COINS = 4;
const REROLL_COST = 2;
const MAX_JOKERS = 5;
const MAX_TAROTS = 3;
const REVEAL_MS = FAST ? 40 : 4500;
const IDLE_DISCONNECT_MS = FAST ? 1000 : 20000;
const IDLE_ANYONE_MS = FAST ? 5000 : 120000;
const IDLE_POLL_MS = FAST ? 200 : 5000;

// Expected points per player: ~9 per deal (hand + pegging) plus ~4 per crib.
// The multiplier grows exponentially: gentle for rounds 1-3 (0.5x-0.9x of an
// average round), biting by 4-5, brutal at 6 (~2x), near-impossible by 9 (~5x)
// — jokers are the only way to keep pace.
export function computeBlind(round, playerCount, dealsInRound) {
  const cribsEach = playerCount === 2 ? 2 : 1;
  const expected = dealsInRound * 9 + cribsEach * 4;
  const mult = 0.5 * Math.pow(1.33, round - 1);
  return Math.max(5, Math.round(expected * mult / 5) * 5);
}

export class Game {
  // seats = [{ id, name, connected }] in join order
  constructor(seats, hooks) {
    this.onUpdate = hooks.onUpdate || (() => {});
    this.logFn = hooks.log || (() => {});
    this.players = seats.map((s, i) => ({
      id: s.id, name: s.name, seat: i, connected: s.connected !== false,
      isBot: !!s.isBot,
      active: true, eliminatedRound: null, blindsPassed: 0,
      deck: makeDeck(), drawPile: [], pendingPack: null, pegPlays: 0,
      score: 0, roundScore: 0, coins: STARTING_COINS, jokers: [], tarots: [],
      hand: [], kept: [], pegLeft: [], discarded: false, ready: false,
      dealPoints: 0, shopOffer: null,
    }));
    this.solo = this.players.some(p => p.isBot);
    if (this.solo) this.botTimer = setInterval(() => this.botTick(), FAST ? 25 : 900);
    this.round = 0;
    this.dealNumber = 0;
    this.dealerSeat = -1;
    this.phase = 'idle';
    this.lastProgress = Date.now();
    this.idleTimer = setInterval(() => this.checkIdle(), IDLE_POLL_MS);
    this.startRound();
  }

  destroy() {
    clearInterval(this.idleTimer);
    clearInterval(this.revealTimer);
    clearInterval(this.botTimer);
  }

  // ---- The House (solo bot) ----

  botTick() {
    try {
      for (const p of this.players) {
        if (!p.isBot || !p.active) continue;
        if (this.phase === 'discard' && !p.discarded) { this.botDiscard(p); return; }
        if (this.phase === 'pegging' && this.turnSeat === p.seat) { this.botPeg(p); return; }
        if ((this.phase === 'scoring' || this.phase === 'roundEnd') && !p.ready) { this.setReady(p); return; }
        if (this.phase === 'shop' && !p.ready) { this.botShop(p); return; }
      }
    } catch (e) {
      console.error('botTick error:', e);
    }
  }

  botDiscard(p) {
    const combos = [];
    for (let i = 0; i < p.hand.length; i++) {
      if (this.discardCount === 1) combos.push([p.hand[i]]);
      else for (let j = i + 1; j < p.hand.length; j++) combos.push([p.hand[i], p.hand[j]]);
    }
    const shortcut = this.mods(p).shortcut;
    let best = combos[0], bestScore = -1;
    for (const combo of combos) {
      const keep = p.hand.filter(c => !combo.includes(c));
      const bd = scoreBreakdown(keep, null, false, { shortcut });
      const s = bd.fifteens * 2 + bd.pairs * 2 + bd.runPoints + bd.flush;
      if (s > bestScore) { bestScore = s; best = combo; }
    }
    this.discard(p, best.map(c => c.id));
  }

  botPeg(p) {
    const legal = p.pegLeft.filter(c => this.pegCount + cardValue(c.rank) <= 31);
    if (!legal.length) return;
    let best = legal[0], bestVal = -Infinity;
    for (const c of legal) {
      const count = this.pegCount + cardValue(c.rank);
      const pts = pegEvents([...this.pegStack, c], count).reduce((a, e) => a + e.pts, 0);
      const v = pts - (count === 5 || count === 21 ? 0.5 : 0) + cardValue(c.rank) * 0.01;
      if (v > bestVal) { bestVal = v; best = c; }
    }
    this.playCard(p, best.id);
  }

  botShop(p) {
    if (p.pendingPack) {
      const opts = p.pendingPack.options;
      let idx = opts.findIndex(o => o.kind === 'joker' && p.jokers.length < MAX_JOKERS);
      if (idx === -1) idx = opts.findIndex(o => o.kind === 'card');
      this.pickPack(p, idx);
      return;
    }
    if (p.shopOffer) {
      const idx = p.shopOffer.findIndex(it => !it.sold && it.cost <= p.coins &&
        (it.kind === 'joker' ? p.jokers.length < MAX_JOKERS :
         it.kind === 'pack' ? it.id === 'buffoon' && p.jokers.length < MAX_JOKERS && it.cost + 2 <= p.coins :
         false));
      if (idx >= 0) { this.buyItem(p, idx); return; }
    }
    this.setReady(p);
  }

  log(text) { this.logFn(text); }
  touch() { this.lastProgress = Date.now(); }
  bySeat(s) { return this.players[s]; }
  byId(id) { return this.players.find(p => p.id === id); }
  mods(p) { return aggregateMods(p.jokers); }
  actives() { return this.players.filter(p => p.active); }

  nextActiveSeat(from) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const s = (from + i + n) % n;
      if (this.bySeat(s).active) return s;
    }
    return -1;
  }

  addPoints(p, pts, why) {
    if (pts <= 0) return;
    p.score += pts;
    p.roundScore += pts;
    p.dealPoints += pts;
    this.log(`${p.name} scores ${pts} (${why})`);
  }

  // ---- rounds ----

  startRound() {
    this.round++;
    const k = this.actives().length;
    this.dealsInRound = k >= 3 ? k : 4;
    this.blind = computeBlind(this.round, k, this.dealsInRound);
    this.dealIndexInRound = 0;
    for (const p of this.players) p.roundScore = 0;
    this.log(`=== Round ${this.round} — beat the blind: ${this.blind} ===`);
    this.startDeal();
  }

  startDeal() {
    this.dealNumber++;
    this.dealIndexInRound++;
    this.dealerSeat = this.nextActiveSeat(this.dealerSeat);
    const k = this.actives().length;
    this.cardsEach = k === 2 ? 6 : 5;
    this.discardCount = k === 2 ? 2 : 1;
    this.crib = [];
    this.starter = null;
    this.pegCount = 0;
    this.pegStack = [];
    this.last31 = false;
    this.goAnnounced = new Set();
    this.turnSeat = null;
    this.scoringResults = null;
    this.revealIndex = 0;
    this.roundEndData = null;
    // everyone plays from their own (Balatro-style, permanently editable) deck
    for (const p of this.players) {
      if (p.active) {
        const pile = shuffle(p.deck.slice());
        p.hand = pile.slice(0, this.cardsEach);
        p.drawPile = pile.slice(this.cardsEach);
      } else {
        p.hand = []; p.drawPile = [];
      }
      p.kept = []; p.pegLeft = []; p.pegPlays = 0; p.pendingPack = null;
      p.discarded = !p.active; p.ready = false; p.dealPoints = 0;
    }
    if (k === 3) this.crib.push(this.bySeat(this.dealerSeat).drawPile.pop());
    this.phase = 'discard';
    this.log(`--- Deal ${this.dealIndexInRound}/${this.dealsInRound} — ${this.bySeat(this.dealerSeat).name} deals ---`);
    this.touch();
    this.onUpdate();
  }

  // ---- discard phase ----

  discard(p, cardIds) {
    if (this.phase !== 'discard' || !p.active || p.discarded) return 'Not your moment to discard.';
    if (!Array.isArray(cardIds) || new Set(cardIds).size !== this.discardCount) {
      return `Pick exactly ${this.discardCount} card(s) for the crib.`;
    }
    const picked = cardIds.map(id => p.hand.find(c => c.id === id));
    if (picked.some(c => !c)) return 'Card not in your hand.';
    p.hand = p.hand.filter(c => !cardIds.includes(c.id));
    this.crib.push(...picked);
    p.discarded = true;
    this.log(`${p.name} sent ${this.discardCount} card(s) to the crib`);
    this.touch();
    if (this.actives().every(pl => pl.discarded)) this.cut();
    this.onUpdate();
  }

  useTarot(p, tarotIdx, targetIds) {
    if (this.phase !== 'discard' || !p.active || p.discarded) return 'Tarots can only be used before you discard.';
    const tid = p.tarots[tarotIdx];
    const def = tid && TAROTS_BY_ID[tid];
    if (!def) return 'No such tarot.';
    targetIds = targetIds || [];
    if (new Set(targetIds).size !== def.targets) return `${def.name} needs ${def.targets} target card(s).`;
    const targets = targetIds.map(id => p.hand.find(c => c.id === id));
    if (targets.some(c => !c)) return 'Target card not in your hand.';

    const up = c => { c.rank = c.rank % 13 + 1; };
    switch (def.id) {
      case 'sun': up(targets[0]); break;
      case 'moon': targets[0].rank = targets[0].rank === 1 ? 13 : targets[0].rank - 1; break;
      case 'strength': targets.forEach(up); break;
      case 'death': targets[0].rank = targets[1].rank; targets[0].suit = targets[1].suit; break;
      case 'lovers': targets[0].suit = targets[1].suit; break;
      case 'justice': targets[0].rank = 5; break;
      case 'star': targets[0].rank = 11; break;
      case 'empress': targets.forEach(c => { c.suit = 0; }); break;
      case 'emperor': targets.forEach(c => { c.suit = 1; }); break;
      case 'devil': targets.forEach(c => { c.suit = 2; }); break;
      case 'tower': targets.forEach(c => { c.suit = 3; }); break;
      case 'priestess': {
        const c = targets[0];
        p.deck.push(makeCard(c.rank, c.suit));
        break;
      }
      case 'hanged_man': {
        if (p.deck.length - targets.length < 15) return 'Your deck is too thin to destroy more cards.';
        if (p.drawPile.length < targets.length) return 'Not enough cards left to redraw.';
        const ids = targets.map(c => c.id);
        p.deck = p.deck.filter(c => !ids.includes(c.id));
        p.hand = p.hand.filter(c => !ids.includes(c.id));
        p.hand.push(...p.drawPile.splice(0, targets.length));
        break;
      }
      case 'judgement': {
        if (p.jokers.length >= MAX_JOKERS) return `You can hold at most ${MAX_JOKERS} jokers.`;
        const j = randomJoker(p.jokers);
        if (!j) return 'No jokers left to gain.';
        p.jokers.push(j.id);
        this.log(`${p.name}'s Judgement summons ${j.name}`);
        break;
      }
      case 'wheel': {
        const count = p.hand.length;
        if (p.drawPile.length < count) return 'Not enough cards left to redraw.';
        p.hand = p.drawPile.splice(0, count);
        break;
      }
      case 'hermit': p.coins += 5; break;
    }
    p.tarots.splice(tarotIdx, 1);
    this.log(`${p.name} used ${def.name}`);
    this.touch();
    this.onUpdate();
  }

  cut() {
    this.starter = this.bySeat(this.dealerSeat).drawPile.pop();
    this.log(`Starter cut: ${cardName(this.starter)}`);
    const dealer = this.bySeat(this.dealerSeat);
    if (this.starter.rank === 11) {
      this.addPoints(dealer, this.mods(dealer).heelsVal, 'His Heels');
    }
    for (const p of this.actives()) {
      const c = this.mods(p).coinOnCut;
      if (c) { p.coins += c; this.log(`${p.name} pockets ${c} coin(s) (Cutpurse)`); }
    }
    for (const p of this.actives()) {
      p.kept = p.hand.slice();
      p.pegLeft = p.hand.slice();
    }
    this.phase = 'pegging';
    this.turnSeat = this.nextActiveSeat(this.dealerSeat);
    this.lastPlayerSeat = null;
  }

  // ---- pegging ----

  canPlay(p) {
    return p.pegLeft.some(c => this.pegCount + cardValue(c.rank) <= 31);
  }

  playCard(p, cardId) {
    if (this.phase !== 'pegging') return 'Not in the pegging phase.';
    if (p.seat !== this.turnSeat) return 'Not your turn.';
    const card = p.pegLeft.find(c => c.id === cardId);
    if (!card) return 'Card not in your hand.';
    if (this.pegCount + cardValue(card.rank) > 31) return 'That would push the count past 31.';

    p.pegLeft = p.pegLeft.filter(c => c.id !== cardId);
    this.pegCount += cardValue(card.rank);
    this.pegStack.push({ ...card, seat: p.seat });
    this.lastPlayerSeat = p.seat;
    this.log(`${p.name} plays ${cardName(card)} — count ${this.pegCount}`);

    const mods = this.mods(p);
    let pts = 0;
    for (const ev of pegEvents(this.pegStack, this.pegCount)) {
      let evPts = ev.type === 'thirtyone' ? mods.thirtyOneVal : ev.pts;
      pts += evPts;
      this.log(`  ${ev.type === 'thirtyone' ? '31!' : ev.type}${ev.size ? ' of ' + ev.size : ''}`);
    }
    if (mods.pegFirst && p.pegPlays === 0) {
      pts += mods.pegFirst;
      this.log('  Pony Express 🃏');
    }
    if (mods.smallBall && card.rank >= 2 && card.rank <= 5) {
      pts += mods.smallBall;
      this.log('  Small Ball 🃏');
    }
    p.pegPlays++;
    pts *= mods.pegMult;
    this.addPoints(p, pts, 'pegging');
    this.last31 = this.pegCount === 31;
    this.touch();
    this.advancePeg(p.seat);
    this.onUpdate();
  }

  advancePeg(justPlayedSeat) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const s = (justPlayedSeat + i) % n;
      const p = this.bySeat(s);
      if (this.canPlay(p)) {
        this.announceGos(justPlayedSeat, s);
        this.turnSeat = s;
        return;
      }
    }
    // nobody can play: close out this count
    const last = this.bySeat(this.lastPlayerSeat);
    const allEmpty = this.players.every(p => p.pegLeft.length === 0);
    if (!this.last31) {
      this.addPoints(last, this.mods(last).goVal * this.mods(last).pegMult, allEmpty ? 'last card' : 'go');
    }
    this.pegCount = 0;
    this.pegStack = [];
    this.last31 = false;
    this.goAnnounced = new Set();
    for (let i = 1; i <= n; i++) {
      const s = (this.lastPlayerSeat + i) % n;
      if (this.bySeat(s).pegLeft.length) { this.turnSeat = s; return; }
    }
    if (last.pegLeft.length) { this.turnSeat = this.lastPlayerSeat; return; }
    this.doScoring();
  }

  announceGos(fromSeat, toSeat) {
    const n = this.players.length;
    for (let s = (fromSeat + 1) % n; s !== toSeat; s = (s + 1) % n) {
      const p = this.bySeat(s);
      if (p.pegLeft.length && !this.canPlay(p) && !this.goAnnounced.has(s)) {
        this.goAnnounced.add(s);
        this.log(`${p.name} says go`);
      }
    }
  }

  // ---- show / scoring ----

  doScoring() {
    this.phase = 'scoring';
    this.turnSeat = null;
    const n = this.players.length;
    const results = [];
    const handTotals = new Map(); // seat -> hand score (for Muggins)
    for (let i = 1; i <= n; i++) {
      const p = this.bySeat((this.dealerSeat + i) % n);
      if (!p.active) continue;
      const mods = this.mods(p);
      const bd = scoreBreakdown(p.kept, this.starter, false, { shortcut: mods.shortcut });
      const { total, lines } = buildScore(bd, mods, 'hand', p.kept, { starter: this.starter, coins: p.coins });
      results.push({ kind: 'hand', seat: p.seat, name: p.name, cards: p.kept.slice(), lines, total });
      handTotals.set(p.seat, total);
      this.addPoints(p, total, 'hand');
    }
    const dealer = this.bySeat(this.dealerSeat);
    const dmods = this.mods(dealer);
    const cribBd = scoreBreakdown(this.crib, this.starter, true, { shortcut: dmods.shortcut });
    const cribRes = buildScore(cribBd, dmods, 'crib', this.crib, { starter: this.starter, coins: dealer.coins });
    results.push({ kind: 'crib', seat: dealer.seat, name: dealer.name, cards: this.crib.slice(), lines: cribRes.lines, total: cribRes.total });
    this.addPoints(dealer, cribRes.total, 'crib');

    // Muggins: feast on opponents' weak hands
    for (const p of this.actives()) {
      const mug = this.mods(p).muggins;
      if (!mug) continue;
      for (const [seat, total] of handTotals) {
        if (seat === p.seat || total >= 4) continue;
        const mine = results.find(r => r.kind === 'hand' && r.seat === p.seat);
        mine.lines.push({ label: `Muggins on ${this.bySeat(seat).name} 🃏`, pts: mug });
        mine.total += mug;
        this.addPoints(p, mug, 'muggins');
      }
    }

    for (const p of this.actives()) {
      const mods = this.mods(p);
      const gain = 3 + Math.floor(p.dealPoints / 5) + mods.coinsPerDeal + mods.coinPerBlind * p.blindsPassed;
      p.coins += gain;
      p.coinGain = gain;
    }
    for (const p of this.players) p.ready = !p.active;
    this.scoringResults = results;
    this.revealIndex = 0;
    clearInterval(this.revealTimer);
    this.revealTimer = setInterval(() => {
      if (this.revealIndex < this.scoringResults.length - 1) {
        this.revealIndex++;
        this.touch();
        this.onUpdate();
        if (this.revealIndex >= this.scoringResults.length - 1) {
          clearInterval(this.revealTimer);
          this.maybeAdvance();
          this.onUpdate();
        }
      }
    }, REVEAL_MS);
    this.touch();
  }

  // ---- blind check ----

  enterRoundEnd() {
    this.phase = 'roundEnd';
    // The House is exempt: in solo your run lasts as long as YOU beat blinds
    const rows = this.actives().filter(p => !p.isBot).map(p => ({
      seat: p.seat, name: p.name, roundScore: p.roundScore,
      passed: p.roundScore >= this.blind,
    }));
    let rescued = false;
    if (rows.length >= 2 && !rows.some(r => r.passed)) {
      const max = Math.max(...rows.map(r => r.roundScore));
      for (const r of rows) r.passed = r.roundScore === max;
      rescued = true;
    }
    for (const p of this.actives()) {
      if (p.isBot && p.roundScore >= this.blind) p.blindsPassed++;
    }
    for (const r of rows) {
      const p = this.bySeat(r.seat);
      if (r.passed) {
        p.blindsPassed++;
      } else {
        p.active = false;
        p.eliminatedRound = this.round;
        this.log(`${p.name} failed the blind (${r.roundScore}/${this.blind}) — eliminated!`);
      }
    }
    this.roundEndData = { blind: this.blind, round: this.round, rows, rescued };
    for (const p of this.players) p.ready = !p.active;
    this.touch();
  }

  // ---- shop ----

  openShop() {
    this.phase = 'shop';
    for (const p of this.players) {
      p.shopOffer = p.active ? makeShopOffer(p) : null;
      p.ready = !p.active;
    }
    this.touch();
  }

  buyItem(p, idx) {
    if (this.phase !== 'shop') return 'The shop is closed.';
    if (p.pendingPack) return 'Open your booster pack first.';
    const item = p.shopOffer && p.shopOffer[idx];
    if (!item || item.sold) return 'Item not available.';
    if (p.coins < item.cost) return 'Not enough coins.';
    if (item.kind === 'joker') {
      if (p.jokers.length >= MAX_JOKERS) return `You can hold at most ${MAX_JOKERS} jokers.`;
      p.jokers.push(item.id);
    } else if (item.kind === 'tarot') {
      if (p.tarots.length >= MAX_TAROTS) return `You can hold at most ${MAX_TAROTS} tarots.`;
      p.tarots.push(item.id);
    } else {
      p.pendingPack = { type: item.id, name: item.name, options: openPack(item.id, p) };
    }
    p.coins -= item.cost;
    item.sold = true;
    this.log(`${p.name} bought ${item.name}`);
    this.touch();
    this.onUpdate();
  }

  pickPack(p, idx) {
    if (this.phase !== 'shop' || !p.pendingPack) return 'No pack to open.';
    if (idx !== -1) {
      const opt = p.pendingPack.options[idx];
      if (!opt) return 'No such option.';
      if (opt.kind === 'joker') {
        if (p.jokers.length >= MAX_JOKERS) return `You can hold at most ${MAX_JOKERS} jokers.`;
        p.jokers.push(opt.id);
      } else if (opt.kind === 'tarot') {
        if (p.tarots.length >= MAX_TAROTS) return `You can hold at most ${MAX_TAROTS} tarots.`;
        p.tarots.push(opt.id);
      } else {
        p.deck.push(makeCard(opt.rank, opt.suit));
      }
      this.log(`${p.name} took ${opt.name || cardName(opt)} from a ${p.pendingPack.name}`);
    } else {
      this.log(`${p.name} skipped a ${p.pendingPack.name}`);
    }
    p.pendingPack = null;
    this.touch();
    this.onUpdate();
  }

  reroll(p) {
    if (this.phase !== 'shop') return 'The shop is closed.';
    if (!p.active) return 'Spectators cannot shop.';
    if (p.coins < REROLL_COST) return 'Not enough coins to reroll.';
    p.coins -= REROLL_COST;
    p.shopOffer = makeShopOffer(p);
    this.touch();
    this.onUpdate();
  }

  setReady(p) {
    if (this.phase !== 'scoring' && this.phase !== 'shop' && this.phase !== 'roundEnd') return;
    if (!p.active) return;
    if (p.pendingPack) return 'Open your booster pack first.';
    p.ready = true;
    this.touch();
    this.maybeAdvance();
    this.onUpdate();
  }

  maybeAdvance() {
    if (!this.actives().every(p => p.ready || !p.connected)) return;
    if (this.phase === 'scoring') {
      if (this.revealIndex < this.scoringResults.length - 1) return;
      clearInterval(this.revealTimer);
      if (this.dealIndexInRound >= this.dealsInRound) this.enterRoundEnd();
      else this.openShop();
    } else if (this.phase === 'roundEnd') {
      if (this.actives().length <= 1) this.endGame();
      else this.openShop();
    } else if (this.phase === 'shop') {
      if (this.dealIndexInRound >= this.dealsInRound) this.startRound();
      else this.startDeal();
    }
  }

  endGame() {
    this.phase = 'gameover';
    this.standings = this.players
      .map(p => ({ seat: p.seat, name: p.name, score: p.score, eliminatedRound: p.eliminatedRound }))
      .sort((a, b) => {
        if ((a.eliminatedRound === null) !== (b.eliminatedRound === null)) return a.eliminatedRound === null ? -1 : 1;
        if (a.eliminatedRound !== b.eliminatedRound) return b.eliminatedRound - a.eliminatedRound;
        return b.score - a.score;
      });
    if (this.solo) {
      const human = this.players.find(p => !p.isBot);
      this.log(`Run over — ${human.name} reached round ${this.round} with ${human.score} points.`);
    } else {
      this.log(`Game over! ${this.standings[0].name} outlasted the table.`);
    }
    this.destroy();
  }

  // ---- stall handling ----

  checkIdle() {
    const idle = Date.now() - this.lastProgress;
    if (idle > IDLE_ANYONE_MS) this.autoAct(true);
    else if (idle > IDLE_DISCONNECT_MS) this.autoAct(false);
  }

  playerDisconnected(id) {
    const p = this.byId(id);
    if (p) p.connected = false;
    this.maybeAdvance();
    this.onUpdate();
  }

  playerReconnected(id) {
    const p = this.byId(id);
    if (p) p.connected = true;
    this.onUpdate();
  }

  autoAct(forceAll) {
    const acts = p => forceAll || !p.connected;
    if (this.phase === 'discard') {
      for (const p of this.actives()) {
        if (!p.discarded && acts(p)) {
          this.discard(p, p.hand.slice(0, this.discardCount).map(c => c.id));
          this.log(`(auto-discard for ${p.name})`);
        }
      }
    } else if (this.phase === 'pegging') {
      const p = this.bySeat(this.turnSeat);
      if (p && acts(p)) {
        const card = p.pegLeft.find(c => this.pegCount + cardValue(c.rank) <= 31);
        if (card) {
          this.log(`(auto-play for ${p.name})`);
          this.playCard(p, card.id);
        }
      }
    } else if (this.phase === 'scoring' || this.phase === 'shop' || this.phase === 'roundEnd') {
      if (this.phase === 'scoring' && this.revealIndex < this.scoringResults.length - 1) return;
      for (const p of this.actives()) {
        if (p.pendingPack && acts(p)) this.pickPack(p, -1);
        if (!p.ready && acts(p)) this.setReady(p);
      }
    }
  }

  // ---- per-player view ----

  stateFor(playerId) {
    const me = this.byId(playerId);
    const inDiscard = this.phase === 'discard';
    return {
      phase: this.phase,
      solo: this.solo,
      round: this.round,
      blind: this.blind,
      dealNumber: this.dealNumber,
      dealIndexInRound: this.dealIndexInRound,
      dealsInRound: this.dealsInRound,
      dealerSeat: this.dealerSeat,
      turnSeat: this.turnSeat,
      discardCount: this.discardCount,
      starter: this.starter,
      pegCount: this.pegCount,
      pegStack: this.pegStack,
      cribCount: this.crib.length,
      mySeat: me ? me.seat : -1,
      revealIndex: this.revealIndex,
      you: me ? {
        active: me.active,
        hand: inDiscard ? me.hand : me.pegLeft,
        deck: sortedDeck(me.deck),
        coins: me.coins, score: me.score, roundScore: me.roundScore, dealPoints: me.dealPoints,
        blindsPassed: me.blindsPassed,
        jokers: me.jokers.map(id => JOKERS_BY_ID[id]),
        tarots: me.tarots.map(id => TAROTS_BY_ID[id]),
        discarded: me.discarded, ready: me.ready, coinGain: me.coinGain || 0,
        canDiscard: inDiscard && me.active && !me.discarded,
        shopOffer: this.phase === 'shop' ? me.shopOffer : null,
        pendingPack: this.phase === 'shop' ? me.pendingPack : null,
      } : null,
      players: this.players.map(p => ({
        seat: p.seat, name: p.name, score: p.score, roundScore: p.roundScore, coins: p.coins,
        connected: p.connected, active: p.active, eliminatedRound: p.eliminatedRound, isBot: p.isBot,
        handCount: inDiscard ? p.hand.length : p.pegLeft.length,
        played: this.phase === 'pegging'
          ? p.kept.filter(c => !p.pegLeft.some(l => l.id === c.id))
          : [],
        discarded: p.discarded, ready: p.ready,
        jokers: p.jokers.map(id => JOKERS_BY_ID[id].name),
        tarotCount: p.tarots.length,
        deckCount: p.deck.length,
        isDealer: p.seat === this.dealerSeat,
      })),
      scoringResults: this.phase === 'scoring' ? this.scoringResults : null,
      roundEndData: this.phase === 'roundEnd' ? this.roundEndData : null,
      standings: this.phase === 'gameover' ? this.standings : null,
    };
  }
}
