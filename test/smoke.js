// Headless bot game: spins up the server, connects N ws clients, plays full
// matches until one player remains. Exercises discard, tarots, pegging,
// staged scoring reveal, blind checks/elimination, and the shop.
process.env.CRIB_FAST = '1';

import WebSocket from 'ws';
const { start } = await import('../server.js');
const { Game } = await import('../lib/game.js');
const { makeCard } = await import('../lib/cards.js');

const PORT = 3100;

async function testRestorePegClosing() {
  const game = new Game([
    { id: 'p1', name: 'Solo1', connected: true },
    { id: 'p2', name: 'The House', connected: true, isBot: true },
  ], { onUpdate() {}, log() {} });
  game.phase = 'pegging';
  game.pegClosing = true;
  game.pegCount = 12;
  game.turnSeat = null;
  game.lastPlayerSeat = 1;
  game.players[0].pegLeft = [makeCard(5, 0)];
  game.players[1].pegLeft = [];
  const snap = game.snapshot();
  game.destroy();

  const restored = Game.fromSnapshot(snap, { onUpdate() {}, log() {} });
  await new Promise(r => setTimeout(r, 80));
  if (restored.pegClosing || restored.turnSeat !== 0) {
    console.error('FAIL: restored peg-closing game did not resume', {
      pegClosing: restored.pegClosing,
      turnSeat: restored.turnSeat,
    });
    process.exit(1);
  }
  restored.destroy();
}

function testDeckEffects() {
  const aurora = new Game([
    { id: 'p1', name: 'Aurora', connected: true, deckArt: 'aurora' },
    { id: 'p2', name: 'Classic', connected: true },
  ], { onUpdate() {}, log() {} });
  const ap = aurora.players[0];
  const chosen = ap.hand.slice(0, aurora.discardNeed(ap));
  const burned = chosen[chosen.length - 1];
  aurora.discard(ap, chosen.map(c => c.id));
  if (aurora.crib.length !== 2 || ap.deck.some(c => c.id === burned.id)) {
    console.error('FAIL: Aurora did not send two cards and remove the final selection', {
      crib: aurora.crib.length,
      burnedStillInDeck: ap.deck.some(c => c.id === burned.id),
    });
    process.exit(1);
  }
  aurora.destroy();

  const ruby = new Game([
    { id: 'p1', name: 'Ruby', connected: true, deckArt: 'ruby' },
    { id: 'p2', name: 'Classic', connected: true },
  ], { onUpdate() {}, log() {} });
  const rp = ruby.players[0];
  const rubyDeckSuits = new Set(rp.deck.map(c => c.suit));
  if (!rp.rubySuits || rp.rubySuits.length !== 2 || rubyDeckSuits.size !== 2 || [...rubyDeckSuits].some(s => !rp.rubySuits.includes(s))) {
    console.error('FAIL: Ruby did not choose and apply two suits', rp.rubySuits, [...rubyDeckSuits]);
    process.exit(1);
  }
  ruby.destroy();

  const gambit = new Game([
    { id: 'p1', name: 'Gambit', connected: true, deckArt: 'gambit' },
    { id: 'p2', name: 'Classic', connected: true },
  ], { onUpdate() {}, log() {} });
  const gp = gambit.players[0];
  if (!gp.gambitRandomized || gp.deck.length !== 52 || gp.deck.some(c => c.rank < 1 || c.rank > 13 || c.suit < 0 || c.suit > 3)) {
    console.error('FAIL: Gambit deck was not randomized into valid cards');
    process.exit(1);
  }
  const charged = makeCard(5, 0);
  gp.deck.push(charged);
  gp.hand = [charged];
  gp.kept = [charged];
  gp.pegLeft = [charged];
  gambit.players[1].kept = [];
  gambit.players[1].pegLeft = [makeCard(10, 1)];
  gambit.phase = 'pegging';
  gambit.turnSeat = gp.seat;
  gambit.pegCount = 10;
  gambit.pegStack = [];
  gambit.starter = makeCard(1, 2);
  gambit.playCard(gp, charged.id);
  if (gp.dealHandBonus !== 2 || gp.dealPegMult < 2 || !charged.gambitCharged || gambit.lastPlayAnim.pointGain !== 2) {
    console.error('FAIL: Gambit 15 did not grant Mult, Hand points, and charge the card');
    process.exit(1);
  }
  const charged31 = makeCard(10, 3);
  gp.deck.push(charged31);
  gp.hand.push(charged31);
  gp.kept.push(charged31);
  gp.pegLeft = [charged31];
  gambit.turnSeat = gp.seat;
  gambit.pegCount = 21;
  gambit.pegStack = [];
  gambit.playCard(gp, charged31.id);
  if (gp.dealHandBonus !== 4 || !charged31.gambitCharged || gambit.lastPlayAnim.pointGain !== 2) {
    console.error('FAIL: Gambit 31 did not add another Hand bonus and charge the card');
    process.exit(1);
  }
  clearTimeout(gambit.closeTimer);
  gambit.closeTimer = null;
  gambit.pegClosing = false;
  gambit.doScoring();
  const gambitHand = gambit.scoringResults.find(r => r.kind === 'hand' && r.seat === gp.seat);
  const chargedIds = [charged.id, charged31.id];
  if (!gambitHand || gambitHand.points < 4 ||
      chargedIds.some(id => !gambitHand.cards.some(c => c.id === id && c.gambitCharged)) ||
      chargedIds.some(id => gp.deck.some(c => c.id === id))) {
    console.error('FAIL: Gambit charged card did not score and leave the deck');
    process.exit(1);
  }
  gambit.destroy();

  const triggerGame = new Game([
    { id: 'p1', name: 'Triggers', connected: true },
    { id: 'p2', name: 'Other', connected: true },
  ], { onUpdate() {}, log() {} });
  const tp = triggerGame.players[0];
  const triggerCard = makeCard(3, 0);
  tp.jokers = [{ id: 'odd_todd', stamp: 'blue' }, 'lusty_joker', 'low_rider'];
  tp.hand = [triggerCard];
  tp.kept = [triggerCard];
  tp.pegLeft = [triggerCard];
  triggerGame.players[1].kept = [];
  triggerGame.players[1].pegLeft = [makeCard(10, 1)];
  triggerGame.phase = 'pegging';
  triggerGame.turnSeat = tp.seat;
  triggerGame.pegCount = 12;
  triggerGame.pegStack = [];
  triggerGame.starter = makeCard(1, 2);
  triggerGame.playCard(tp, triggerCard.id);
  if (tp.dealHandBonus !== 4 || triggerGame.lastPlayAnim.pointGain !== 4) {
    console.error('FAIL: stacked pegging Hand jokers did not trigger with blue stamp', tp.dealHandBonus);
    process.exit(1);
  }
  triggerGame.doScoring();
  const triggerHand = triggerGame.scoringResults.find(r => r.kind === 'hand' && r.seat === tp.seat);
  if (!triggerHand || triggerHand.points !== 8 || !triggerHand.lines.some(l => l.label.includes('Odd Todd')) ||
      !triggerHand.lines.some(l => l.label.includes('Lusty Joker'))) {
    console.error('FAIL: pegging Hand bonuses were not carried into hand scoring', triggerHand);
    process.exit(1);
  }
  triggerGame.destroy();

  const missGame = new Game([
    { id: 'p1', name: 'Miss', connected: true },
    { id: 'p2', name: 'Other', connected: true },
  ], { onUpdate() {}, log() {} });
  const mp = missGame.players[0];
  const missCard = makeCard(3, 0);
  mp.jokers = ['odd_todd', 'lusty_joker', 'low_rider'];
  mp.pegLeft = [missCard];
  missGame.players[1].pegLeft = [makeCard(10, 1)];
  missGame.phase = 'pegging';
  missGame.turnSeat = mp.seat;
  missGame.pegCount = 0;
  missGame.pegStack = [];
  missGame.playCard(mp, missCard.id);
  if (mp.dealHandBonus !== 0 || missGame.lastPlayAnim.pointGain !== 0) {
    console.error('FAIL: pegging Hand jokers triggered without a scoring play');
    process.exit(1);
  }
  missGame.destroy();

  const passiveGame = new Game([
    { id: 'p1', name: 'Passives', connected: true },
    { id: 'p2', name: 'Other', connected: true },
  ], { onUpdate() {}, log() {} });
  const pp = passiveGame.players[0];
  pp.jokers = ['overseer', 'obelisk', 'bull_market', 'even_steven', 'jack_of_all', 'scary_face', 'his_majesty'];
  pp.coins = 8;
  pp.kept = [makeCard(2, 1), makeCard(11, 0)];
  passiveGame.players[1].kept = [];
  passiveGame.starter = makeCard(12, 2);
  passiveGame.doScoring();
  const passiveHand = passiveGame.scoringResults.find(r => r.kind === 'hand' && r.seat === pp.seat);
  if (!passiveHand || passiveHand.points !== 23 || pp.dealHandBonus !== 0) {
    console.error('FAIL: restored passive Hand jokers did not score at passive rates', passiveHand);
    process.exit(1);
  }
  passiveGame.destroy();
}

function bot(name, opts) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const b = { name, ws, state: null, done: false };
  ws.on('open', () => {
    if (opts.solo) ws.send(JSON.stringify({ t: 'createSolo', playerName: name }));
    else if (opts.create) ws.send(JSON.stringify({ t: 'createRoom', roomName: 'smoke', playerName: name }));
  });
  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.t === 'rooms' && !opts.create && !b.joined && msg.rooms.length) {
      b.joined = true;
      ws.send(JSON.stringify({ t: 'joinRoom', roomId: msg.rooms[0].id, playerName: name }));
    }
    if (msg.t === 'roomUpdate' && opts.create && msg.players.length === opts.total && !b.started) {
      b.started = true;
      ws.send(JSON.stringify({ t: 'startGame' }));
    }
    if (msg.t === 'state') {
      b.state = msg.state;
      act(b);
    }
    if (msg.t === 'error') b.lastError = msg.text;
  });
  ws.on('error', e => { throw e; });
  return b;
}

function act(b) {
  const st = b.state;
  const you = st.you;
  setTimeout(() => {
    if (b.done || !b.state || b.state !== st) return;
    if (st.phase === 'gameover') { b.done = true; return; }
    if (!you.active) return; // spectating
    if (st.phase === 'discard' && you.canDiscard) {
      if (you.tarots.length && Math.random() < 0.5) {
        const def = you.tarots[0];
        const targets = you.hand.slice(0, def.targets).map(c => c.id);
        b.ws.send(JSON.stringify({ t: 'useTarot', idx: 0, targets }));
      } else {
        const cards = you.hand.slice(0, st.discardCount).map(c => c.id);
        b.ws.send(JSON.stringify({ t: 'discard', cards }));
      }
    } else if (st.phase === 'pegging' && st.turnSeat === st.mySeat) {
      const card = you.hand.find(c => st.pegCount + Math.min(c.rank, 10) <= 31);
      if (card) b.ws.send(JSON.stringify({ t: 'playCard', card: card.id }));
    } else if ((st.phase === 'scoring' || st.phase === 'shop' || st.phase === 'roundEnd') && !you.ready) {
      if (st.phase === 'shop' && you.pendingPack) {
        const opts = you.pendingPack.options;
        let idx = opts.findIndex(o => o.kind === 'joker' && you.jokers.length < 5);
        if (idx === -1) idx = opts.findIndex(o => o.kind === 'card');
        if (idx === -1) idx = opts.findIndex(o => o.kind === 'tarot' && you.tarots.length < 2);
        b.ws.send(JSON.stringify({ t: 'pickPack', idx })); // -1 skips
        return;
      }
      if (st.phase === 'shop' && you.shopOffer) {
        const idx = you.shopOffer.findIndex(it => !it.sold && it.cost <= you.coins &&
          (it.kind === 'joker' ? you.jokers.length < 5 :
           it.kind === 'tarot' ? you.tarots.length < 2 : true));
        if (idx >= 0 && Math.random() < 0.7) {
          b.ws.send(JSON.stringify({ t: 'buy', idx }));
          return; // next state update re-triggers act
        }
      }
      b.ws.send(JSON.stringify({ t: 'ready' }));
    }
  }, 5);
}

async function runMatch(nPlayers) {
  console.log(`--- smoke: ${nPlayers} players ---`);
  const bots = [];
  bots.push(bot('Bot1', { create: true, total: nPlayers }));
  await new Promise(r => setTimeout(r, 200));
  for (let i = 2; i <= nPlayers; i++) {
    bots.push(bot('Bot' + i, {}));
    await new Promise(r => setTimeout(r, 100));
  }

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (bots.every(b => b.done)) break;
    await new Promise(r => setTimeout(r, 200));
  }
  if (!bots.every(b => b.done)) {
    const b = bots.find(x => !x.done);
    console.error('STALLED. phase=', b.state && b.state.phase, 'round=', b.state && b.state.round,
      'turnSeat=', b.state && b.state.turnSeat, 'lastError=', b.lastError);
    for (const x of bots) {
      console.error(`  ${x.name}: done=${x.done} ready=${x.state && x.state.you.ready}`,
        'pendingPack=', x.state && JSON.stringify(x.state.you.pendingPack),
        'active=', x.state && x.state.you.active, 'phase=', x.state && x.state.phase);
    }
    process.exit(1);
  }
  const final = bots[0].state;
  if (!final.standings || final.standings.length !== nPlayers) {
    console.error('FAIL: bad standings', final.standings);
    process.exit(1);
  }
  const winners = final.standings.filter(s => s.eliminatedRound === null);
  console.log(`gameover OK after round ${final.round}:`,
    final.standings.map(s => `${s.name}:${s.score}${s.eliminatedRound === null ? '(W)' : '(r' + s.eliminatedRound + ')'}`).join('  '));
  if (winners.length < 1) {
    console.error('FAIL: no winner recorded');
    process.exit(1);
  }
  for (const b of bots) {
    b.ws.send(JSON.stringify({ t: 'backToLobby' }));
    b.ws.close();
  }
  await new Promise(r => setTimeout(r, 200));
}

async function runSolo() {
  console.log('--- smoke: solo vs The House ---');
  const b = bot('Solo1', { solo: true });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !b.done) {
    await new Promise(r => setTimeout(r, 200));
  }
  if (!b.done) {
    console.error('SOLO STALLED. phase=', b.state && b.state.phase, 'round=', b.state && b.state.round,
      'turnSeat=', b.state && b.state.turnSeat, 'lastError=', b.lastError);
    process.exit(1);
  }
  const final = b.state;
  if (!final.solo || !final.standings || final.standings.length !== 2) {
    console.error('FAIL: bad solo gameover', final.solo, final.standings);
    process.exit(1);
  }
  const me = final.standings.find(s => s.name === 'Solo1');
  console.log(`solo run over OK: reached round ${final.round}, score ${me.score}`);
  b.ws.send(JSON.stringify({ t: 'backToLobby' }));
  b.ws.close();
  await new Promise(r => setTimeout(r, 200));
}

const server = await start(PORT);
testDeckEffects();
await testRestorePegClosing();
await runMatch(2);
await runMatch(3);
await runMatch(5);
await runSolo();
console.log('smoke test passed');
server.close();
process.exit(0);
