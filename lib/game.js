import { makeDeck, shuffle, cardValue, cardName } from './cards.js';
import { scoreBreakdown, pegEvents } from './scoring.js';
import { JOKERS_BY_ID, TAROTS_BY_ID, aggregateMods, applyMods, makeShopOffer } from './jokers.js';

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
      active: true, eliminatedRound: null,
      score: 0, roundScore: 0, coins: STARTING_COINS, jokers: [], tarots: [],
      hand: [], kept: [], pegLeft: [], discarded: false, ready: false,
      dealPoints: 0, shopOffer: null,
    }));
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
    this.deck = shuffle(makeDeck());
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
    for (const p of this.players) {
      p.hand = p.active ? this.deck.splice(0, this.cardsEach) : [];
      p.kept = []; p.pegLeft = [];
      p.discarded = !p.active; p.ready = false; p.dealPoints = 0;
    }
    if (k === 3) this.crib.push(this.deck.pop());
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

    switch (def.id) {
      case 'sun': targets[0].rank = targets[0].rank % 13 + 1; break;
      case 'moon': targets[0].rank = targets[0].rank === 1 ? 13 : targets[0].rank - 1; break;
      case 'death': targets[0].rank = targets[1].rank; targets[0].suit = targets[1].suit; break;
      case 'lovers': targets[0].suit = targets[1].suit; break;
      case 'justice': targets[0].rank = 5; break;
      case 'star': targets[0].rank = 11; break;
      case 'wheel': {
        const count = p.hand.length;
        p.hand = this.deck.splice(0, count);
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
    this.starter = this.deck.pop();
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
    for (let i = 1; i <= n; i++) {
      const p = this.bySeat((this.dealerSeat + i) % n);
      if (!p.active) continue;
      const mods = this.mods(p);
      const bd = scoreBreakdown(p.kept, this.starter, false);
      const total = applyMods(bd, mods, false, p.kept);
      results.push(this.makeResult('hand', p, p.kept, bd, mods, total));
      this.addPoints(p, total, 'hand');
    }
    const dealer = this.bySeat(this.dealerSeat);
    const dmods = this.mods(dealer);
    const cribBd = scoreBreakdown(this.crib, this.starter, true);
    const cribTotal = applyMods(cribBd, dmods, true, this.crib);
    results.push(this.makeResult('crib', dealer, this.crib, cribBd, dmods, cribTotal));
    this.addPoints(dealer, cribTotal, 'crib');

    for (const p of this.actives()) {
      const gain = 3 + Math.floor(p.dealPoints / 5) + this.mods(p).coinsPerDeal;
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

  makeResult(kind, p, cards, bd, mods, total) {
    const J = ' 🃏';
    const lines = [];
    if (bd.fifteens) lines.push({ label: `Fifteens ×${bd.fifteens}${mods.fifteenVal !== 2 ? J : ''}`, pts: bd.fifteens * mods.fifteenVal });
    if (bd.pairs) lines.push({ label: `Pairs ×${bd.pairs}${mods.pairVal !== 2 ? J : ''}`, pts: bd.pairs * mods.pairVal });
    if (bd.runPoints) lines.push({ label: `Runs${mods.runBonus ? J : ''}`, pts: bd.runPoints + bd.runCount * mods.runBonus });
    if (bd.flush) lines.push({ label: `Flush${mods.flushMult !== 1 ? J : ''}`, pts: bd.flush * mods.flushMult });
    if (bd.nobs) lines.push({ label: `His Nobs${mods.nobsVal !== 1 ? J : ''}`, pts: bd.nobs * mods.nobsVal });
    if (kind !== 'crib') {
      let bonus = mods.handFlat;
      for (const rb of mods.rankBonuses) bonus += cards.filter(c => c.rank === rb.rank).length * rb.pts;
      if (bonus) lines.push({ label: 'Joker bonus' + J, pts: bonus });
    } else if (mods.cribMult > 1) {
      lines.push({ label: `Golden Crib ×${mods.cribMult}${J}`, pts: null });
    }
    return { kind, seat: p.seat, name: p.name, cards: cards.slice(), lines, total };
  }

  // ---- blind check ----

  enterRoundEnd() {
    this.phase = 'roundEnd';
    const rows = this.actives().map(p => ({
      seat: p.seat, name: p.name, roundScore: p.roundScore,
      passed: p.roundScore >= this.blind,
    }));
    let rescued = false;
    if (!rows.some(r => r.passed)) {
      const max = Math.max(...rows.map(r => r.roundScore));
      for (const r of rows) r.passed = r.roundScore === max;
      rescued = true;
    }
    for (const r of rows) {
      if (!r.passed) {
        const p = this.bySeat(r.seat);
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
    const item = p.shopOffer && p.shopOffer[idx];
    if (!item || item.sold) return 'Item not available.';
    if (p.coins < item.cost) return 'Not enough coins.';
    if (item.kind === 'joker') {
      if (p.jokers.length >= MAX_JOKERS) return `You can hold at most ${MAX_JOKERS} jokers.`;
      p.jokers.push(item.id);
    } else {
      if (p.tarots.length >= MAX_TAROTS) return `You can hold at most ${MAX_TAROTS} tarots.`;
      p.tarots.push(item.id);
    }
    p.coins -= item.cost;
    item.sold = true;
    this.log(`${p.name} bought ${item.name}`);
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
    this.log(`Game over! ${this.standings[0].name} outlasted the table.`);
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
        coins: me.coins, score: me.score, roundScore: me.roundScore, dealPoints: me.dealPoints,
        jokers: me.jokers.map(id => JOKERS_BY_ID[id]),
        tarots: me.tarots.map(id => TAROTS_BY_ID[id]),
        discarded: me.discarded, ready: me.ready, coinGain: me.coinGain || 0,
        canDiscard: inDiscard && me.active && !me.discarded,
        shopOffer: this.phase === 'shop' ? me.shopOffer : null,
      } : null,
      players: this.players.map(p => ({
        seat: p.seat, name: p.name, score: p.score, roundScore: p.roundScore, coins: p.coins,
        connected: p.connected, active: p.active, eliminatedRound: p.eliminatedRound,
        handCount: inDiscard ? p.hand.length : p.pegLeft.length,
        played: this.phase === 'pegging'
          ? p.kept.filter(c => !p.pegLeft.some(l => l.id === c.id))
          : [],
        discarded: p.discarded, ready: p.ready,
        jokers: p.jokers.map(id => JOKERS_BY_ID[id].name),
        tarotCount: p.tarots.length,
        isDealer: p.seat === this.dealerSeat,
      })),
      scoringResults: this.phase === 'scoring' ? this.scoringResults : null,
      roundEndData: this.phase === 'roundEnd' ? this.roundEndData : null,
      standings: this.phase === 'gameover' ? this.standings : null,
    };
  }
}
