'use strict';

// Headless bot game: spins up the server, connects N ws clients, plays a
// full match to gameover. Exercises discard, tarots, pegging, scoring, shop.

const WebSocket = require('ws');
const { start } = require('../server');

const PORT = 3100;

function bot(name, opts) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const b = { name, ws, state: null, done: false };
  ws.on('open', () => {
    if (opts.create) ws.send(JSON.stringify({ t: 'createRoom', roomName: 'smoke', playerName: name }));
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
    if (st.phase === 'discard' && you.canDiscard) {
      if (you.tarots.length && Math.random() < 0.5) {
        const idx = 0;
        const def = you.tarots[idx];
        const targets = you.hand.slice(0, def.targets).map(c => c.id);
        b.ws.send(JSON.stringify({ t: 'useTarot', idx, targets }));
      } else {
        const cards = you.hand.slice(0, st.discardCount).map(c => c.id);
        b.ws.send(JSON.stringify({ t: 'discard', cards }));
      }
    } else if (st.phase === 'pegging' && st.turnSeat === st.mySeat) {
      const card = you.hand.find(c => st.pegCount + Math.min(c.rank, 10) <= 31);
      if (card) b.ws.send(JSON.stringify({ t: 'playCard', card: card.id }));
    } else if ((st.phase === 'scoring' || st.phase === 'shop') && !you.ready) {
      if (st.phase === 'shop' && you.shopOffer) {
        const idx = you.shopOffer.findIndex(it => !it.sold && it.cost <= you.coins &&
          (it.kind === 'joker' ? you.jokers.length < 5 : you.tarots.length < 3));
        if (idx >= 0 && Math.random() < 0.7) {
          b.ws.send(JSON.stringify({ t: 'buy', idx }));
          return; // next state update will re-trigger act
        }
      }
      b.ws.send(JSON.stringify({ t: 'ready' }));
    } else if (st.phase === 'gameover') {
      b.done = true;
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

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (bots.every(b => b.done)) break;
    await new Promise(r => setTimeout(r, 200));
  }
  if (!bots.every(b => b.done)) {
    const b = bots.find(x => !x.done);
    console.error('STALLED. phase=', b.state && b.state.phase,
      'turnSeat=', b.state && b.state.turnSeat, 'lastError=', b.lastError);
    process.exit(1);
  }
  const final = bots[0].state;
  console.log('gameover OK:', final.standings.map(s => `${s.name}:${s.score}`).join('  '));
  if (final.dealNumber !== final.totalDeals) {
    console.error(`FAIL: ended after ${final.dealNumber} deals, expected ${final.totalDeals}`);
    process.exit(1);
  }
  for (const b of bots) {
    b.ws.send(JSON.stringify({ t: 'backToLobby' }));
    b.ws.close();
  }
  await new Promise(r => setTimeout(r, 200));
}

(async () => {
  const server = await start(PORT);
  await runMatch(2);   // 3 rotations -> 6 deals
  await runMatch(3);   // 2 rotations -> 6 deals
  await runMatch(5);   // 1 rotation  -> 5 deals
  console.log('smoke test passed');
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
