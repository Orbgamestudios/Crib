import { makeDeck, makeCard, sortedDeck, shuffle, cardValue, cardName } from './cards.js';
import { scoreBreakdown, pegEvents } from './scoring.js';
import {
  TAROTS_BY_ID,
  aggregateMods, buildScore, makeShopOffer, openPack, randomJoker, randomTarot,
  effectiveJokerIds, jokerCapacity, jokerDef, jokerId, normalizeJoker,
} from './jokers.js';

// smoke tests: collapse all pacing (browser has no `process`)
const FAST = typeof process !== 'undefined' && !!(process.env && process.env.CRIB_FAST);
const STARTING_COINS = 0;
const REROLL_START_COST = 2;
const MAX_JOKERS = 5;
const MAX_TAROTS = 2;
const REVEAL_MS = FAST ? 40 : 2200;
const SCORE_DONE_HOLD_MS = FAST ? 0 : 1800;
const PEG_CLOSE_MS = FAST ? 30 : 1150; // hold the closing pile visible before it sweeps
const BOT_ACTION_MS = FAST ? 25 : 1300;
const BOT_REACTION_MS = FAST ? 0 : 1100;
const IDLE_DISCONNECT_MS = FAST ? 1000 : 20000;
const IDLE_ANYONE_MS = FAST ? 5000 : 120000;
const IDLE_POLL_MS = FAST ? 200 : 5000;

// Each deal scores hand/crib Points × pegging Mult (Balatro-style), so per-deal
// yield is far larger than the old additive system — blinds are scaled up to
// match, then made ~30% harder all round. The round multiplier grows
// exponentially: gentle rounds 1-3, biting by 4-5, brutal at 6 (~2x),
// near-impossible by 9 (~5x). Jokers are the only way to keep pace.
const BASE_MULT = 1;        // every hand starts at ×1; pegging adds to it
const PER_DEAL_YIELD = 28;  // avg hand Points × avg pegging Mult per deal
const PER_CRIB_YIELD = 18;  // avg crib Points × dealer Mult
const HARDER = 1.30;        // 30% harder all around
export function computeBlind(round, playerCount, dealsInRound) {
  const cribsEach = playerCount === 2 ? 2 : 1;
  const expected = dealsInRound * PER_DEAL_YIELD + cribsEach * PER_CRIB_YIELD;
  const mult = 0.37 * Math.pow(1.33, round - 1) * HARDER;
  const earlyRelief = round === 1 ? 40 : round === 2 ? 20 : 0;
  return Math.max(20, Math.round(expected * mult * 2 / 5) * 5 - earlyRelief);
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
      deck: makeDeck(), drawPile: [], pendingPack: null, pegPlays: 0, dealPegMult: 0,
      score: 0, roundScore: 0, coins: STARTING_COINS, jokers: [], tarots: [],
      hand: [], kept: [], pegLeft: [], discarded: false, ready: false,
      scoringDone: false, dealPoints: 0, shopOffer: null, rerollCost: REROLL_START_COST,
    }));
    this.solo = this.players.some(p => p.isBot);
    this.nextBotAt = Date.now() + BOT_ACTION_MS;
    if (this.solo) this.botTimer = setInterval(() => this.botTick(), FAST ? 25 : 300);
    this.round = 0;
    this.dealNumber = 0;
    this.dealerSeat = -1;
    this.roundComplete = false;
    this.phase = 'idle';
    this.animSeq = 0;
    this.lastPlayAnim = null;
    this.lastMultAnim = null;
    this.lastProgress = Date.now();
    this.idleTimer = setInterval(() => this.checkIdle(), IDLE_POLL_MS);
    this.startRound();
  }

  destroy() {
    clearInterval(this.idleTimer);
    clearInterval(this.revealTimer);
    clearInterval(this.botTimer);
    clearTimeout(this.closeTimer);
  }

  snapshot() {
    const skip = new Set(['onUpdate', 'logFn', 'idleTimer', 'revealTimer', 'botTimer', 'nextBotAt', 'closeTimer']);
    const out = {};
    for (const [k, v] of Object.entries(this)) {
      if (!skip.has(k)) out[k] = v;
    }
    return JSON.parse(JSON.stringify(out));
  }

  static fromSnapshot(snapshot, hooks) {
    const seats = (snapshot.players || []).map(p => ({
      id: p.id, name: p.name, connected: p.connected, isBot: p.isBot,
    }));
    const game = new Game(seats, { onUpdate() {}, log() {} });
    const keepTimers = {
      idleTimer: game.idleTimer,
      botTimer: game.botTimer,
    };
    clearInterval(game.revealTimer);
    Object.assign(game, JSON.parse(JSON.stringify(snapshot)));
    game.onUpdate = hooks.onUpdate || (() => {});
    game.logFn = hooks.log || (() => {});
    game.idleTimer = keepTimers.idleTimer;
    game.botTimer = keepTimers.botTimer;
    game.revealTimer = null;
    game.closeTimer = null;
    game.nextBotAt = Date.now() + BOT_ACTION_MS;
    if (game.phase === 'scoring') {
      game.revealIndex = Math.max(0, (game.scoringResults || []).length - 1);
      game.scoreDoneAt = 0;
    } else if (game.phase === 'pegging' && game.pegClosing) {
      game.closeTimer = setTimeout(() => { game.finishCount(); game.onUpdate(); }, PEG_CLOSE_MS);
    } else if (game.phase === 'pegging' && game.turnSeat == null) {
      game.finishCount();
    }
    return game;
  }

  // ---- The House (solo bot) ----

  botTick() {
    try {
      const now = Date.now();
      if (now < this.nextBotAt) return;
      if (now - this.lastProgress < BOT_REACTION_MS) {
        this.nextBotAt = this.lastProgress + BOT_REACTION_MS;
        return;
      }
      for (const p of this.players) {
        if (!p.isBot || !p.active) continue;
        let acted = false;
        if (this.phase === 'discard' && !p.discarded) { this.botDiscard(p); acted = true; }
        else if (this.phase === 'pegging' && this.turnSeat === p.seat) { this.botPeg(p); acted = true; }
        else if ((this.phase === 'scoring' && (!p.scoringDone || (this.canPlayerShop(p) && !p.ready))) ||
          (this.phase === 'roundEnd' && !p.ready)) {
          if (this.phase !== 'scoring' || this.scoringCanAdvance()) {
            this.setReady(p);
            acted = true;
          }
        } else if (this.phase === 'shop' && !p.ready) { this.botShop(p); acted = true; }
        if (acted) {
          this.nextBotAt = Date.now() + BOT_ACTION_MS;
          return;
        }
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
      let idx = opts.findIndex(o => o.kind === 'joker' && p.jokers.length < this.maxJokers(p));
      if (idx === -1) idx = opts.findIndex(o => o.kind === 'card');
      this.pickPack(p, idx);
      return;
    }
    if (p.shopOffer) {
      const idx = p.shopOffer.findIndex(it => !it.sold && it.cost <= p.coins &&
        (it.kind === 'joker' ? p.jokers.length < this.maxJokers(p) :
         it.kind === 'pack' ? it.id === 'buffoon' && p.jokers.length < this.maxJokers(p) && it.cost + 2 <= p.coins :
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
  maxJokers(p) { return jokerCapacity(p.jokers, MAX_JOKERS); }
  canOpenPack(p, type) {
    if (type === 'buffoon') return p.jokers.length < this.maxJokers(p);
    if (type === 'arcana') return p.tarots.length < MAX_TAROTS;
    return true;
  }
  actives() { return this.players.filter(p => p.active); }

  effectiveJokers(p) {
    return effectiveJokerIds(p.jokers).map(j => jokerDef(j)).filter(Boolean);
  }

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

  scorePegMult(p, card, events) {
    const eventScores = events.map(ev => ({ ev, pts: ev.pts }));
    let total = eventScores.reduce((sum, e) => sum + e.pts, 0);
    const bumpEvent = (type, value, label) => {
      let changed = false;
      for (const row of eventScores) {
        if (row.ev.type !== type || row.pts >= value) continue;
        total += value - row.pts;
        row.pts = value;
        changed = true;
      }
      if (changed) this.log(`  ${label} [Joker]`);
    };
    for (const def of this.effectiveJokers(p)) {
      switch (def.id) {
        case 'fifteen_fanatic':
          bumpEvent('fifteen', 3, 'Fifteen Fanatic');
          break;
        case 'holo_fifteen':
          bumpEvent('fifteen', 4, 'Holo Fifteen');
          break;
        case 'salute_31':
          bumpEvent('thirtyone', 5, '31 Salute');
          break;
        case 'pony_express':
          if (p.pegPlays === 0) {
            total += 2;
            this.log('  Pony Express [Joker]');
          }
          break;
        case 'counter_king':
          if (total > 0 && this.pegCount > 15) {
            total += 2;
            this.log('  Counter King +2 [Joker]');
          }
          break;
        case 'overclock':
          if (total > 0 && p.pegPlays >= 2) {
            total *= 3;
            this.log('  Overclock ×3 [Joker]');
          }
          break;
        default:
          if (def.mods.pegMult && def.mods.pegMult !== 1 && total > 0) {
            total *= def.mods.pegMult;
            this.log(`  ${def.name} ×${def.mods.pegMult} [Joker]`);
          }
          break;
      }
    }
    return total;
  }

  scoreGoMult(p) {
    let total = 1;
    for (const def of this.effectiveJokers(p)) {
      if (def.id === 'last_card_larry') {
        if (total < 3) total += 3 - total;
        this.log('  Last Card Larry [Joker]');
      } else if (def.mods.pegMult && def.mods.pegMult !== 1 && total > 0) {
        total *= def.mods.pegMult;
        this.log(`  ${def.name} ×${def.mods.pegMult} [Joker]`);
      }
    }
    return total;
  }

  // ---- rounds ----

  startRound() {
    this.round++;
    this.roundComplete = false;
    const k = this.actives().length;
    this.dealsInRound = k >= 3 ? k : 4;
    this.blind = computeBlind(this.round, k, this.dealsInRound);
    this.dealIndexInRound = 0;
    this.blindFinishCounter = 0; // order in which players cross the blind this round
    for (const p of this.players) { p.roundScore = 0; p.blindFinishOrder = null; }
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
      p.dealPegMult = this.mods(p).stampRedMult || 0;
      p.rerollCost = REROLL_START_COST;
      p.discarded = !p.active; p.ready = false; p.scoringDone = false; p.dealPoints = 0;
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
    const pmods = this.mods(p);
    // Acemaker: the cards you throw to the crib become Aces (fresh cards so your
    // own deck is untouched), keeping their suit
    const cribCards = pmods.cribAces ? picked.map(c => makeCard(1, c.suit)) : picked;
    this.crib.push(...cribCards);
    if (pmods.cribAces) this.log(`${p.name}'s Acemaker turns the crib drop${cribCards.length > 1 ? 's' : ''} into Aces`);
    const copies = pmods.duplicateFirstCrib;
    if (copies && cribCards[0]) {
      for (let i = 0; i < copies; i++) {
        const copy = makeCard(cribCards[0].rank, cribCards[0].suit);
        this.crib.push(copy);
        p.deck.push(makeCard(copy.rank, copy.suit));
      }
      this.log(`${p.name}'s Crib Copier copied ${cardName(cribCards[0])} into the crib and deck`);
    }
    // Crib Diviner: 10+ worth of cards thrown to the crib earns a random tarot
    if (pmods.cribTenTarot && p.tarots.length < MAX_TAROTS) {
      const worth = picked.reduce((s, c) => s + cardValue(c.rank), 0);
      if (worth >= 10) {
        const t = randomTarot();
        p.tarots.push(t.id);
        this.log(`${p.name}'s Crib Diviner conjures ${t.name} (crib worth ${worth})`);
      }
    }
    p.discarded = true;
    this.log(`${p.name} sent ${this.discardCount} card(s) to the crib`);
    this.touch();
    if (this.actives().every(pl => pl.discarded)) this.cut();
    this.onUpdate();
  }

  useTarot(p, tarotIdx, targetIds) {
    if (!p.active) return 'Spectators cannot use tarots.';
    const tid = p.tarots[tarotIdx];
    const def = tid && TAROTS_BY_ID[tid];
    if (!def) return 'No such tarot.';
    const shopUse = this.canPlayerShop(p) && !p.ready && def.targets === 0 && def.id !== 'wheel';
    const discardUse = this.phase === 'discard' && !p.discarded;
    if (!shopUse && !discardUse) return def.targets || def.id === 'wheel'
      ? 'This tarot needs your hand. Use it during discard before you throw to the crib.'
      : 'Tarots can only be used in the shop or before you discard.';
    targetIds = targetIds || [];
    let targets = [];
    if (def.jokerStamp) {
      if (targetIds.length !== 1) return `${def.name} needs one joker.`;
    } else {
      if (new Set(targetIds).size !== def.targets) return `${def.name} needs ${def.targets} target card(s).`;
      targets = targetIds.map(id => p.hand.find(c => c.id === id));
      if (targets.some(c => !c)) return 'Target card not in your hand.';
    }

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
        if (p.jokers.length >= this.maxJokers(p)) return `You can hold at most ${this.maxJokers(p)} jokers.`;
        const j = randomJoker(p.jokers);
        if (!j) return 'No jokers left to gain.';
        p.jokers.push(j);
        this.log(`${p.name}'s Judgement summons ${jokerDef(j).name}`);
        break;
      }
      case 'wheel': {
        const count = p.hand.length;
        if (p.drawPile.length < count) return 'Not enough cards left to redraw.';
        p.hand = p.drawPile.splice(0, count);
        break;
      }
      case 'hermit': p.coins += 5; break;
      case 'violet_seal':
      case 'scarlet_seal':
      case 'ivory_seal': {
        const jokerIdx = Number(targetIds[0]);
        const owned = normalizeJoker(p.jokers[jokerIdx]);
        if (!owned) return 'Pick one of your jokers.';
        if (owned.stamp) return 'That joker already has a stamp.';
        owned.stamp = def.jokerStamp;
        p.jokers[jokerIdx] = owned;
        this.log(`${p.name} stamped ${jokerDef(owned).name} with ${def.name}`);
        break;
      }
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
      const heels = this.mods(dealer).heelsVal;
      dealer.dealPegMult += heels;
      this.log(`His Heels — ${dealer.name} +${heels} Mult`);
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
    const playedCard = { ...card, seat: p.seat };
    this.pegStack.push(playedCard);
    this.lastPlayAnim = { seq: ++this.animSeq, card: playedCard, multGain: 0 };
    this.lastPlayerSeat = p.seat;
    this.log(`${p.name} plays ${cardName(card)} — count ${this.pegCount}`);

    const mods = this.mods(p);
    const events = pegEvents(this.pegStack, this.pegCount);
    for (const ev of events) {
      this.log(`  ${ev.type === 'thirtyone' ? '31!' : ev.type}${ev.size ? ' of ' + ev.size : ''}`);
    }
    if (mods.smallBall && card.rank >= 2 && card.rank <= 5) {
      this.addPoints(p, mods.smallBall, 'Small Ball');
      this.log('  Small Ball [Joker]');
    }
    const pts = this.scorePegMult(p, card, events);
    p.pegPlays++;
    this.lastPlayAnim.multGain = pts;
    if (pts > 0) this.lastMultAnim = { seq: ++this.animSeq, seat: p.seat, multGain: pts };
    if (pts > 0) {
      p.dealPegMult += pts;
      this.log(`  ${p.name} +${pts} Mult`);
    }
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
    // nobody can play: close out this count — award points, then HOLD the
    // finished pile on screen for a beat so everyone sees it before it sweeps
    const last = this.bySeat(this.lastPlayerSeat);
    const allEmpty = this.players.every(p => p.pegLeft.length === 0);
    if (!this.last31) {
      const goPts = this.scoreGoMult(last);
      last.dealPegMult += goPts;
      this.lastMultAnim = { seq: ++this.animSeq, seat: last.seat, multGain: goPts };
      this.log(`${last.name} +${goPts} Mult (${allEmpty ? 'last card' : 'go'})`);
    }
    this.turnSeat = null;     // freeze input during the hold
    this.pegClosing = true;   // client keeps the pile visible, then sweeps it
    this.touch();
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => { this.finishCount(); this.onUpdate(); }, PEG_CLOSE_MS);
  }

  finishCount() {
    this.pegClosing = false;
    this.pegCount = 0;
    this.pegStack = [];
    this.last31 = false;
    this.goAnnounced = new Set();
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const s = (this.lastPlayerSeat + i) % n;
      if (this.bySeat(s).pegLeft.length) { this.turnSeat = s; return; }
    }
    if (this.bySeat(this.lastPlayerSeat).pegLeft.length) { this.turnSeat = this.lastPlayerSeat; return; }
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
    const starter = this.starter;

    // Pass 1 — each active player's hand Points (chips) and their deal Mult
    // (Mult = 1 + pegging points earned this deal).
    const handBlocks = [];
    for (let i = 1; i <= n; i++) {
      const p = this.bySeat((this.dealerSeat + i) % n);
      if (!p.active) continue;
      const mods = this.mods(p);
      const bd = scoreBreakdown(p.kept, starter, false, { shortcut: mods.shortcut });
      const { total: points, lines } = buildScore(bd, mods, 'hand', p.kept, { starter, coins: p.coins });
      handBlocks.push({
        kind: 'hand', player: p, seat: p.seat, name: p.name,
        cards: p.kept.slice(), lines, points, mult: BASE_MULT + p.dealPegMult,
      });
    }

    // Muggins adds chips when an opponent's hand Points come in under 4
    for (const b of handBlocks) {
      const mug = this.mods(b.player).muggins;
      if (!mug) continue;
      for (const other of handBlocks) {
        if (other === b || other.points >= 4) continue;
        b.points += mug;
        b.lines.push({ label: `Muggins on ${other.name} [Joker]`, pts: mug });
      }
    }

    // crib block — scored with the dealer's Mult
    const dealer = this.bySeat(this.dealerSeat);
    const dmods = this.mods(dealer);
    const cribBd = scoreBreakdown(this.crib, starter, true, { shortcut: dmods.shortcut });
    const cribRes = buildScore(cribBd, dmods, 'crib', this.crib, { starter, coins: dealer.coins });
    const cribBonuses = [
      this.crib.some(c => c.rank === 5) ? dmods.cribFiveMult : 0,
      cribRes.total <= 8 ? dmods.cribLeanMult : 0,
      this.crib.every(c => c.rank < 11) ? dmods.cribNoFaceMult : 0,
      Math.floor(this.crib.length / 2) * dmods.cribPairMult,
      cribBd.fifteens * dmods.cribFifteenMult,
    ];
    const cribBonusMult = cribBonuses.reduce((sum, n) => sum + n, 0);
    const cribSuitCount = new Set(this.crib.map(c => c.suit)).size;
    const cribSuitFactor = dmods.cribSuitMult !== 1 ? Math.pow(dmods.cribSuitMult, cribSuitCount) : 1;
    const cribMult = Math.round((BASE_MULT + dealer.dealPegMult + cribBonusMult) * cribSuitFactor * 100) / 100;
    if (cribBonusMult > 0) cribRes.lines.push({ label: `Crib Mult +${cribBonusMult} [Joker]`, pts: null });
    if (cribSuitFactor !== 1) cribRes.lines.push({ label: `Crib Battery ×${cribSuitFactor.toFixed(2)} [Joker]`, pts: null });
    const cribBlock = {
      kind: 'crib', player: dealer, seat: dealer.seat, name: dealer.name,
      cards: this.crib.slice(), lines: cribRes.lines, points: cribRes.total, mult: cribMult,
    };

    // Pass 2 — total = Points × Mult, award, and build the reveal payloads
    const results = [];
    const finalize = b => {
      b.total = b.points * b.mult;
      this.addPoints(b.player, b.total, b.kind);
      results.push({
        kind: b.kind, seat: b.seat, name: b.name, cards: b.cards,
        lines: b.lines, points: b.points, mult: b.mult, total: b.total, noMult: !!b.noMult, starter,
      });
    };
    for (const b of handBlocks) finalize(b);
    finalize(cribBlock);

    for (const p of this.actives()) {
      const mods = this.mods(p);
      // cap the base so a fat crib total doesn't dump coins
      const base = Math.min(7, 2 + Math.floor(p.dealPoints / 18));
      const gain = base + mods.coinsPerDeal + mods.coinPerBlind * p.blindsPassed;
      p.coins += gain;
      p.coinGain = gain;
    }

    // stamp who crossed the blind first (left-of-dealer order breaks ties this
    // deal) so the round-end reward can pay out by finishing position
    for (let i = 1; i <= n; i++) {
      const p = this.bySeat((this.dealerSeat + i) % n);
      if (p.active && p.blindFinishOrder == null && p.roundScore >= this.blind) {
        p.blindFinishOrder = ++this.blindFinishCounter;
      }
    }
    for (const p of this.players) { p.ready = !p.active; p.scoringDone = !p.active; }
    this.scoringResults = results;
    this.revealIndex = 0;
    this.scoreDoneAt = 0;
    clearInterval(this.revealTimer);
    this.revealTimer = setInterval(() => {
      if (this.revealIndex < this.scoringResults.length - 1) {
        this.revealIndex++;
        this.touch();
        this.onUpdate();
        if (this.revealIndex >= this.scoringResults.length - 1) {
          clearInterval(this.revealTimer);
          this.scoreDoneAt = Date.now() + SCORE_DONE_HOLD_MS;
          setTimeout(() => {
            this.maybeAdvance(); // auto-open only after everyone is done viewing scoring
            this.onUpdate();
          }, SCORE_DONE_HOLD_MS);
          this.onUpdate();
        }
      }
    }, REVEAL_MS);
    this.touch();
  }

  // ---- blind check ----

  enterRoundEnd() {
    this.phase = 'roundEnd';
    this.roundComplete = true;
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
      r.bonusCoins = 0;
      if (r.passed) {
        p.blindsPassed++;
      } else {
        p.active = false;
        p.eliminatedRound = this.round;
        this.log(`${p.name} failed the blind (${r.roundScore}/${this.blind}) — eliminated!`);
      }
    }
    // reward by finishing position — whoever cleared the blind first earns most
    const passers = rows.filter(r => r.passed).sort((a, b) =>
      (this.bySeat(a.seat).blindFinishOrder || 999) - (this.bySeat(b.seat).blindFinishOrder || 999));
    const winners = passers.length;
    passers.forEach((r, place) => {
      const p = this.bySeat(r.seat);
      r.place = place + 1;
      // scale with the field: last finisher gets 1, each earlier one +1 more.
      // 2 left → 1st:2, 2nd:1; 3 left → 3,2,1; etc.
      r.bonusCoins = winners - place;
      p.coins += r.bonusCoins;
      p.coinGain = (p.coinGain || 0) + r.bonusCoins;
      this.log(`${p.name} cleared the blind (#${r.place}) for ${r.bonusCoins} bonus coin(s).`);
    });
    this.roundEndData = { blind: this.blind, round: this.round, rows, rescued };
    for (const p of this.players) { p.ready = !p.active; p.scoringDone = !p.active; }
    this.touch();
  }

  sellValue(cost) { return Math.max(1, Math.floor((cost || 2) / 2)); }

  scoringLeadsToShop() {
    return this.phase === 'scoring' &&
      this.scoringCanAdvance() &&
      this.dealIndexInRound < this.dealsInRound &&
      !this.allHumansBeatBlind();
  }

  canPlayerShop(p) {
    return this.phase === 'shop' || (this.scoringLeadsToShop() && p.scoringDone);
  }

  ensureShopOffer(p) {
    if (p.active && !p.shopOffer) p.shopOffer = makeShopOffer(p);
  }

  sellJoker(p, idx) {
    if (!this.canPlayerShop(p)) return 'You can only sell in the shop.';
    const owned = normalizeJoker(p.jokers[idx]);
    const def = owned && jokerDef(owned);
    if (!def) return 'No such joker.';
    const refund = this.sellValue(def.cost);
    p.jokers.splice(idx, 1);
    p.coins += refund;
    this.log(`${p.name} sold ${def.name} for ${refund} coin(s).`);
    this.touch();
    this.onUpdate();
  }

  sellTarot(p, idx) {
    if (!this.canPlayerShop(p)) return 'You can only sell in the shop.';
    const id = p.tarots[idx];
    const def = id && TAROTS_BY_ID[id];
    if (!def) return 'No such tarot.';
    const refund = this.sellValue(def.cost);
    p.tarots.splice(idx, 1);
    p.coins += refund;
    this.log(`${p.name} sold ${def.name} for ${refund} coin(s).`);
    this.touch();
    this.onUpdate();
  }

  // ---- shop ----

  openShop(preserveReady = false, forceReroll = false) {
    this.phase = 'shop';
    for (const p of this.players) {
      if (p.active) {
        if (forceReroll) {
          p.shopOffer = makeShopOffer(p);
          p.rerollCost = REROLL_START_COST;
        }
        else this.ensureShopOffer(p);
        // Card Smith: a free Standard Pack waiting at every shop visit
        if (this.mods(p).freeStandardPack && !p.pendingPack) {
          p.pendingPack = { type: 'standard', name: 'Free Standard Pack', options: openPack('standard', p) };
        }
      } else {
        p.shopOffer = null;
      }
      p.ready = p.active ? (preserveReady ? !!p.ready : false) : true;
      p.scoringDone = false;
    }
    this.touch();
  }

  buyItem(p, idx) {
    if (!this.canPlayerShop(p)) return 'The shop is closed.';
    this.ensureShopOffer(p);
    if (p.pendingPack) return 'Open your booster pack first.';
    const item = p.shopOffer && p.shopOffer[idx];
    if (!item || item.sold) return 'Item not available.';
    if (p.coins < item.cost) return 'Not enough coins.';
    if (item.kind === 'joker') {
      if (p.jokers.length >= this.maxJokers(p) && item.stamp !== 'white') return `You can hold at most ${this.maxJokers(p)} jokers.`;
      p.jokers.push(normalizeJoker(item));
    } else if (item.kind === 'tarot') {
      if (p.tarots.length >= MAX_TAROTS) return `You can hold at most ${MAX_TAROTS} tarots.`;
      p.tarots.push(item.id);
    } else if (item.kind === 'card') {
      p.deck.push(makeCard(item.rank, item.suit));
    } else {
      if (!this.canOpenPack(p, item.id)) {
        return item.id === 'buffoon'
          ? `You can hold at most ${this.maxJokers(p)} jokers.`
          : `You can hold at most ${MAX_TAROTS} tarots.`;
      }
      p.pendingPack = { type: item.id, name: item.name, options: openPack(item.id, p) };
    }
    p.coins -= item.cost;
    item.sold = true;
    this.log(`${p.name} bought ${item.name}`);
    this.touch();
    this.onUpdate();
  }

  pickPack(p, idx) {
    if (!this.canPlayerShop(p) || !p.pendingPack) return 'No pack to open.';
    if (idx !== -1) {
      const opt = p.pendingPack.options[idx];
      if (!opt) return 'No such option.';
      if (opt.kind === 'joker') {
        if (p.jokers.length >= this.maxJokers(p) && opt.stamp !== 'white') return `You can hold at most ${this.maxJokers(p)} jokers.`;
        p.jokers.push(normalizeJoker(opt));
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
    if (!this.canPlayerShop(p)) return 'The shop is closed.';
    if (!p.active) return 'Spectators cannot shop.';
    const cost = p.rerollCost == null ? REROLL_START_COST : p.rerollCost;
    if (p.coins < cost) return 'Not enough coins to reroll.';
    p.coins -= cost;
    p.rerollCost = cost + 1;
    p.shopOffer = makeShopOffer(p);
    this.touch();
    this.onUpdate();
  }

  reorderJokers(p, order) {
    if (!Array.isArray(order) || order.length !== p.jokers.length) return 'Bad joker order.';
    const current = p.jokers.map(jokerId).slice().sort().join('|');
    const next = order.slice().sort().join('|');
    if (current !== next) return 'Bad joker order.';
    const byId = new Map(p.jokers.map(j => [jokerId(j), j]));
    p.jokers = order.map(id => byId.get(id)).filter(Boolean);
    this.touch();
    this.onUpdate();
  }

  setReady(p) {
    if (this.phase !== 'scoring' && this.phase !== 'shop' && this.phase !== 'roundEnd') return;
    if (!p.active) return;
    if (p.pendingPack) return 'Open your booster pack first.';
    if (this.phase === 'scoring') {
      if (!this.scoringCanAdvance()) return;
      if (!p.scoringDone) {
        p.scoringDone = true;
        if (this.scoringLeadsToShop()) this.ensureShopOffer(p);
      } else if (this.canPlayerShop(p)) {
        p.ready = true;
      }
      this.touch();
      this.maybeAdvance();
      this.onUpdate();
      return;
    }
    p.ready = true;
    this.touch();
    this.maybeAdvance();
    this.onUpdate();
  }

  advanceFromScoring() {
    if (this.phase !== 'scoring') return;
    if (this.revealIndex < this.scoringResults.length - 1) return;
    clearInterval(this.revealTimer);
    if (this.dealIndexInRound >= this.dealsInRound || this.allHumansBeatBlind()) this.enterRoundEnd();
    else this.openShop();
  }

  maybeAdvance() {
    if (this.phase === 'scoring') {
      if (!this.actives().every(p => p.scoringDone || p.ready || !p.connected)) return;
      if (this.revealIndex < this.scoringResults.length - 1) return;
      if (!this.scoringCanAdvance()) return;
      clearInterval(this.revealTimer);
      if (this.dealIndexInRound >= this.dealsInRound || this.allHumansBeatBlind()) this.enterRoundEnd();
      else {
        this.openShop(true);
        if (this.actives().every(p => p.ready || !p.connected)) this.maybeAdvance();
      }
    } else if (this.phase === 'roundEnd') {
      if (!this.actives().every(p => p.ready || !p.connected)) return;
      if (this.actives().length <= 1) this.endGame();
      else this.openShop(false, true);
    } else if (this.phase === 'shop') {
      if (!this.actives().every(p => p.ready || !p.connected)) return;
      if (this.roundComplete || this.dealIndexInRound >= this.dealsInRound) this.startRound();
      else this.startDeal();
    }
  }

  scoringCanAdvance() {
    return this.revealIndex >= this.scoringResults.length - 1 && (!this.scoreDoneAt || Date.now() >= this.scoreDoneAt);
  }

  // The House never has to clear a blind, and the moment every human (in solo,
  // just you) reaches the blind the round ends — you move straight to the next.
  allHumansBeatBlind() {
    const humans = this.actives().filter(p => !p.isBot);
    return humans.length > 0 && humans.every(p => p.roundScore >= this.blind);
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
        if (acts(p) && (this.phase !== 'scoring' ? !p.ready : (!p.scoringDone || !p.ready))) this.setReady(p);
      }
    }
  }

  // ---- per-player view ----

  stateFor(playerId) {
    const me = this.byId(playerId);
    const inDiscard = this.phase === 'discard';
    const personalShop = !!(me && this.scoringLeadsToShop() && me.scoringDone);
    const phase = personalShop ? 'shop' : this.phase;
    if (personalShop) this.ensureShopOffer(me);
    return {
      phase,
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
      pegClosing: !!this.pegClosing,
      cribCount: this.crib.length,
      mySeat: me ? me.seat : -1,
      revealIndex: this.revealIndex,
      lastPlayAnim: this.lastPlayAnim,
      lastMultAnim: this.lastMultAnim,
      you: me ? {
        active: me.active,
        hand: inDiscard ? me.hand : me.pegLeft,
        kept: me.kept,
        deck: sortedDeck(me.deck),
        coins: me.coins, score: me.score, roundScore: me.roundScore, dealPoints: me.dealPoints,
        blindsPassed: me.blindsPassed, dealMult: BASE_MULT + me.dealPegMult,
        rerollCost: me.rerollCost == null ? REROLL_START_COST : me.rerollCost,
        jokerSlots: this.maxJokers(me),
        jokers: me.jokers.map(j => ({ ...jokerDef(j), stamp: normalizeJoker(j)?.stamp })),
        tarots: me.tarots.map(id => TAROTS_BY_ID[id]),
        discarded: me.discarded, ready: me.ready, coinGain: me.coinGain || 0,
        canDiscard: inDiscard && me.active && !me.discarded,
        shopOffer: phase === 'shop' ? me.shopOffer : null,
        pendingPack: phase === 'shop' ? me.pendingPack : null,
      } : null,
      players: this.players.map(p => ({
        seat: p.seat, name: p.name, score: p.score, roundScore: p.roundScore, coins: p.coins,
        connected: p.connected, active: p.active, eliminatedRound: p.eliminatedRound, isBot: p.isBot,
        handCount: inDiscard ? p.hand.length : p.pegLeft.length,
        played: this.phase === 'pegging'
          ? p.kept.filter(c => !p.pegLeft.some(l => l.id === c.id))
          : [],
        discarded: p.discarded, ready: p.ready,
        jokers: p.jokers.map(j => jokerDef(j).name),
        tarotCount: p.tarots.length,
        deckCount: p.deck.length,
        isDealer: p.seat === this.dealerSeat,
      })),
      scoringResults: phase === 'scoring' ? this.scoringResults : null,
      roundEndData: phase === 'roundEnd' ? this.roundEndData : null,
      standings: phase === 'gameover' ? this.standings : null,
    };
  }
}
