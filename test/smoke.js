// Headless bot game: spins up the server, connects N ws clients, plays full
// matches until one player remains. Exercises discard, tarots, pegging,
// staged scoring reveal, blind checks/elimination, and the shop.
process.env.CRIB_FAST = '1';

import WebSocket from 'ws';
const { start } = await import('../server.js');

const PORT = 3100;

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
        const ok = you.pendingPack.options.findIndex(o =>
          o.kind === 'joker' ? you.jokers.length < 5 :
          o.kind === 'tarot' ? you.tarots.length < 3 : true);
        b.ws.send(JSON.stringify({ t: 'pickPack', idx: ok }));
        return;
      }
      if (st.phase === 'shop' && you.shopOffer) {
        const idx = you.shopOffer.findIndex(it => !it.sold && it.cost <= you.coins &&
          (it.kind === 'joker' ? you.jokers.length < 5 :
           it.kind === 'tarot' ? you.tarots.length < 3 : true));
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
await runMatch(2);
await runMatch(3);
await runMatch(5);
await runSolo();
console.log('smoke test passed');
server.close();
process.exit(0);
