'use strict';

const $ = id => document.getElementById(id);
const SUIT_CHARS = ['♥', '♦', '♣', '♠']; // H D C S
const RANK_NAMES = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

let ws = null;
let connected = false;
let myRoomId = null;
let lastState = null;
let selected = [];           // card ids picked for discard
let tarotMode = null;        // { idx, def, targets: [] }
let view = 'lobby';

// ---- websocket ----

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    connected = true;
    const savedRoom = sessionStorage.getItem('crib_room');
    const name = localStorage.getItem('crib_name');
    if (savedRoom && name) {
      ws.send(JSON.stringify({ t: 'joinRoom', roomId: savedRoom, playerName: name }));
    }
  };
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => {
    connected = false;
    toast('Connection lost — reconnecting…');
    setTimeout(connect, 2000);
  };
}

function sendMsg(msg) {
  if (connected) ws.send(JSON.stringify(msg));
}

function handle(msg) {
  switch (msg.t) {
    case 'rooms':
      if (view === 'lobby') renderRoomList(msg.rooms);
      break;
    case 'joined':
      myRoomId = msg.roomId;
      sessionStorage.setItem('crib_room', msg.roomId);
      $('log').innerHTML = '';
      (msg.logs || []).forEach(addLog);
      break;
    case 'roomUpdate':
      showView('waiting');
      renderWaiting(msg);
      break;
    case 'state':
      showView('game');
      lastState = msg.state;
      renderGame(msg.state);
      break;
    case 'log':
      addLog(msg.text);
      break;
    case 'error':
      toast(msg.text);
      break;
    case 'left':
      myRoomId = null;
      sessionStorage.removeItem('crib_room');
      showView('lobby');
      renderRoomList(msg.rooms || []);
      break;
  }
}

// ---- views ----

function showView(v) {
  view = v;
  $('lobby').classList.toggle('hidden', v !== 'lobby');
  $('waiting').classList.toggle('hidden', v !== 'waiting');
  $('game').classList.toggle('hidden', v !== 'game');
  if (v !== 'game') $('overlay').classList.add('hidden');
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function addLog(text) {
  const log = $('log');
  const div = document.createElement('div');
  if (text.startsWith('---')) div.className = 'hl';
  div.textContent = text;
  log.appendChild(div);
  while (log.children.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

// ---- lobby ----

function myName() {
  return $('nameInput').value.trim();
}

$('nameInput').value = localStorage.getItem('crib_name') || '';
$('nameInput').addEventListener('input', () => localStorage.setItem('crib_name', myName()));

$('createBtn').onclick = () => {
  if (!myName()) return toast('Enter a name first.');
  sendMsg({ t: 'createRoom', roomName: $('roomNameInput').value.trim() || `${myName()}'s table`, playerName: myName() });
};
$('refreshBtn').onclick = () => sendMsg({ t: 'listRooms' });

function renderRoomList(rooms) {
  const el = $('roomList');
  el.innerHTML = '';
  if (!rooms.length) {
    el.innerHTML = '<div class="empty">No open tables — create one!</div>';
    return;
  }
  for (const r of rooms) {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `<div><b>${esc(r.name)}</b><div class="meta">${r.count}/6 players — ${esc(r.players.join(', '))}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn small primary';
    btn.textContent = 'Join';
    btn.onclick = () => {
      if (!myName()) return toast('Enter a name first.');
      sendMsg({ t: 'joinRoom', roomId: r.id, playerName: myName() });
    };
    div.appendChild(btn);
    el.appendChild(div);
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// ---- waiting room ----

function renderWaiting(msg) {
  $('waitRoomName').textContent = msg.room.name;
  const el = $('waitPlayers');
  el.innerHTML = '';
  for (const p of msg.players) {
    const div = document.createElement('div');
    div.className = 'wp' + (p.connected ? '' : ' off');
    div.textContent = `${p.name}${p.id === msg.hostId ? ' (host)' : ''}${p.connected ? '' : ' — disconnected'}`;
    el.appendChild(div);
  }
  const isHost = msg.youId === msg.hostId;
  const n = msg.players.filter(p => p.connected).length;
  $('startBtn').classList.toggle('hidden', !isHost);
  $('startBtn').disabled = n < 2;
  const rot = n === 2 ? 3 : n <= 4 ? 2 : 1;
  $('waitHint').textContent = n < 2
    ? 'Waiting for at least 2 players…'
    : `${n} players — the deal will go around the table ${rot}× (${n * rot} deals).`;
}

$('startBtn').onclick = () => sendMsg({ t: 'startGame' });
$('leaveBtn').onclick = () => sendMsg({ t: 'leaveRoom' });

// ---- cards ----

function cardEl(card, opts = {}) {
  const div = document.createElement('div');
  div.className = 'card' + (card.suit < 2 ? ' red' : '') + (opts.small ? ' small' : '');
  div.innerHTML = `<span>${RANK_NAMES[card.rank]}</span><span class="suit">${SUIT_CHARS[card.suit]}</span>`;
  return div;
}

function backEl(small) {
  const div = document.createElement('div');
  div.className = 'card back' + (small ? ' small' : '');
  return div;
}

// ---- game rendering ----

function renderGame(st) {
  const you = st.you;
  $('dealInfo').textContent = `Deal ${st.dealNumber}/${st.totalDeals}`;
  $('phaseInfo').textContent = phaseLabel(st);
  const turnP = st.players.find(p => p.seat === st.turnSeat);
  $('turnInfo').textContent =
    st.phase === 'pegging' && turnP ? (turnP.seat === st.mySeat ? '▶ Your turn' : `▶ ${turnP.name}'s turn`) : '';

  renderSeats(st);
  renderCenter(st);
  renderMyArea(st);
  renderOverlay(st);
}

function phaseLabel(st) {
  switch (st.phase) {
    case 'discard': return `Discard ${st.discardCount} to the crib`;
    case 'pegging': return 'Pegging';
    case 'scoring': return 'Counting hands';
    case 'shop': return 'Shop';
    case 'gameover': return 'Game over';
    default: return '';
  }
}

function renderSeats(st) {
  const el = $('seats');
  el.innerHTML = '';
  const n = st.players.length;
  const opponents = st.players.filter(p => p.seat !== st.mySeat);
  // arrange opponents over the top arc, in clockwise table order from my left
  opponents.sort((a, b) =>
    ((a.seat - st.mySeat + n) % n) - ((b.seat - st.mySeat + n) % n));
  opponents.forEach((p, i) => {
    const k = opponents.length;
    const ang = (180 + (i + 1) * 180 / (k + 1)) * Math.PI / 180;
    const x = 50 + 42 * Math.cos(ang);
    const y = 52 + 46 * Math.sin(ang);
    const seat = document.createElement('div');
    seat.className = 'seat' + (p.seat === st.turnSeat ? ' turn' : '') + (p.connected ? '' : ' off');
    seat.style.left = x + '%';
    seat.style.top = y + '%';

    const badges = [];
    if (p.jokers.length) badges.push(`🃏${p.jokers.length}`);
    if (p.tarotCount) badges.push(`🔮${p.tarotCount}`);
    badges.push(`🪙${p.coins}`);
    if (st.phase === 'discard') badges.push(p.discarded ? '✓ discarded' : '… choosing');
    if ((st.phase === 'scoring' || st.phase === 'shop') && p.ready) badges.push('✓ ready');

    const plaque = document.createElement('div');
    plaque.className = 'plaque';
    plaque.innerHTML =
      `<span class="nm">${esc(p.name)}</span> ${p.isDealer ? '<span class="dealer-chip">D</span>' : ''}` +
      ` <span class="sc">${p.score}</span><div class="badges">${badges.join(' ')}</div>`;
    if (p.jokers.length) plaque.title = 'Jokers: ' + p.jokers.join(', ');
    seat.appendChild(plaque);

    const backs = document.createElement('div');
    backs.className = 'backs';
    for (let c = 0; c < p.handCount; c++) backs.appendChild(backEl(true));
    seat.appendChild(backs);

    if (p.played && p.played.length) {
      const played = document.createElement('div');
      played.className = 'played';
      for (const c of p.played) played.appendChild(cardEl(c, { small: true }));
      seat.appendChild(played);
    }
    el.appendChild(seat);
  });
}

function renderCenter(st) {
  const deck = $('deckPile');
  deck.innerHTML = '';
  deck.appendChild(backEl());
  deck.insertAdjacentHTML('beforeend', '<div class="lbl">Deck</div>');

  const starter = $('starterPile');
  starter.innerHTML = '';
  starter.appendChild(st.starter ? cardEl(st.starter) : backEl());
  starter.insertAdjacentHTML('beforeend', '<div class="lbl">Starter</div>');

  const crib = $('cribPile');
  crib.innerHTML = '';
  crib.appendChild(backEl());
  const dealer = st.players.find(p => p.isDealer);
  crib.insertAdjacentHTML('beforeend',
    `<div class="lbl">Crib ${st.cribCount} (${esc(dealer ? dealer.name : '')})</div>`);

  const stack = $('pegStack');
  stack.innerHTML = '';
  for (const c of st.pegStack) stack.appendChild(cardEl(c));
  $('pegCount').textContent = st.phase === 'pegging' ? st.pegCount : '';
}

function renderMyArea(st) {
  const you = st.you;
  const me = st.players.find(p => p.seat === st.mySeat);
  $('myName').innerHTML = `${esc(me.name)} ${me.isDealer ? '<span class="dealer-chip">D</span>' : ''}`;
  $('myScore').textContent = `${you.score} pts`;
  $('myCoins').textContent = `🪙 ${you.coins}`;

  // jokers & tarots
  const jr = $('jokerRow');
  jr.innerHTML = '';
  you.jokers.forEach(j => {
    const d = document.createElement('div');
    d.className = 'mini-card joker';
    d.innerHTML = `${esc(j.name)}<div class="tip">${esc(j.desc)}</div>`;
    jr.appendChild(d);
  });
  if (!you.jokers.length) jr.innerHTML = '<span style="opacity:.4">none yet</span>';

  const tr = $('tarotRow');
  tr.innerHTML = '';
  you.tarots.forEach((t, idx) => {
    const d = document.createElement('div');
    d.className = 'mini-card tarot';
    d.innerHTML = `${esc(t.name)}<div class="tip">${esc(t.desc)}${you.canDiscard ? '<br><i>Click to use</i>' : '<br><i>Usable before you discard</i>'}</div>`;
    if (you.canDiscard) d.onclick = () => startTarot(idx, t);
    tr.appendChild(d);
  });
  if (!you.tarots.length) tr.innerHTML = '<span style="opacity:.4">none yet</span>';

  renderHand(st);
}

function renderHand(st) {
  const you = st.you;
  const handEl = $('hand');
  handEl.innerHTML = '';
  const myTurn = st.phase === 'pegging' && st.turnSeat === st.mySeat;

  selected = selected.filter(id => you.hand.some(c => c.id === id));
  if (tarotMode) tarotMode.targets = tarotMode.targets.filter(id => you.hand.some(c => c.id === id));

  for (const c of you.hand) {
    const el = cardEl(c);
    if (tarotMode) {
      el.classList.add('clickable');
      const pos = tarotMode.targets.indexOf(c.id);
      if (pos >= 0) {
        el.classList.add('selected');
        if (tarotMode.def.targets > 1) el.insertAdjacentHTML('beforeend', `<span class="ordertag">${pos + 1}</span>`);
      }
      el.onclick = () => toggleTarotTarget(c.id);
    } else if (you.canDiscard) {
      el.classList.add('clickable');
      if (selected.includes(c.id)) el.classList.add('selected');
      el.onclick = () => {
        const i = selected.indexOf(c.id);
        if (i >= 0) selected.splice(i, 1);
        else if (selected.length < st.discardCount) selected.push(c.id);
        renderGame(lastState);
      };
    } else if (myTurn) {
      const legal = st.pegCount + Math.min(c.rank, 10) <= 31;
      if (legal) {
        el.classList.add('clickable');
        el.onclick = () => sendMsg({ t: 'playCard', card: c.id });
      } else {
        el.classList.add('dim');
      }
    }
    handEl.appendChild(el);
  }

  // prompt + action button
  const prompt = $('prompt');
  const btn = $('actionBtn');
  const cancel = $('cancelBtn');
  btn.classList.add('hidden');
  cancel.classList.add('hidden');
  prompt.textContent = '';

  if (tarotMode) {
    const need = tarotMode.def.targets;
    prompt.textContent = need
      ? `${tarotMode.def.name}: pick ${need} card(s) — ${tarotMode.def.desc}`
      : `${tarotMode.def.name}: ${tarotMode.def.desc}`;
    btn.textContent = `Use ${tarotMode.def.name}`;
    btn.disabled = tarotMode.targets.length !== need;
    btn.classList.remove('hidden');
    btn.onclick = () => {
      sendMsg({ t: 'useTarot', idx: tarotMode.idx, targets: tarotMode.targets });
      tarotMode = null;
    };
    cancel.classList.remove('hidden');
    cancel.onclick = () => { tarotMode = null; renderGame(lastState); };
  } else if (you.canDiscard) {
    prompt.textContent = `Select ${st.discardCount} card(s) for ${dealerName(st)} crib`;
    btn.textContent = `Send ${st.discardCount} to Crib`;
    btn.disabled = selected.length !== st.discardCount;
    btn.classList.remove('hidden');
    btn.onclick = () => { sendMsg({ t: 'discard', cards: selected }); selected = []; };
  } else if (st.phase === 'discard') {
    prompt.textContent = 'Waiting for the others to discard…';
  } else if (st.phase === 'pegging') {
    if (myTurn) {
      const canAny = you.hand.some(c => st.pegCount + Math.min(c.rank, 10) <= 31);
      prompt.textContent = canAny ? 'Play a card' : 'No legal play — go!';
    } else {
      prompt.textContent = 'Waiting for your turn…';
    }
  }
}

function dealerName(st) {
  const d = st.players.find(p => p.isDealer);
  return d ? (d.seat === st.mySeat ? 'your' : `${d.name}'s`) : '';
}

function startTarot(idx, def) {
  tarotMode = { idx, def, targets: [] };
  renderGame(lastState);
}

function toggleTarotTarget(cardId) {
  const i = tarotMode.targets.indexOf(cardId);
  if (i >= 0) tarotMode.targets.splice(i, 1);
  else if (tarotMode.targets.length < tarotMode.def.targets) tarotMode.targets.push(cardId);
  renderGame(lastState);
}

// ---- overlays: scoring, shop, game over ----

function renderOverlay(st) {
  const ov = $('overlay');
  const oc = $('overlayContent');
  if (st.phase === 'scoring') {
    ov.classList.remove('hidden');
    oc.innerHTML = `<h2>Counting — Deal ${st.dealNumber}</h2>` +
      `<div style="margin-bottom:10px">Starter: </div>`;
    const starterDiv = oc.lastChild;
    starterDiv.appendChild(cardEl(st.starter, { small: true }));
    for (const r of st.scoringResults) {
      oc.appendChild(scoreBlock(r, st));
    }
    oc.insertAdjacentHTML('beforeend',
      `<div style="margin:8px 0">You earned <b style="color:#ffd76e">🪙 ${st.you.coinGain}</b> this deal.</div>`);
    appendReadyBtn(oc, st, st.dealNumber >= st.totalDeals ? 'See Results' : 'To the Shop');
  } else if (st.phase === 'shop') {
    ov.classList.remove('hidden');
    renderShop(oc, st);
  } else if (st.phase === 'gameover') {
    ov.classList.remove('hidden');
    oc.innerHTML = '<h2>Final Standings</h2>';
    (st.standings || []).forEach((s, i) => {
      oc.insertAdjacentHTML('beforeend',
        `<div class="standing${i === 0 ? ' winner' : ''}"><span>${i + 1}. ${esc(s.name)}${i === 0 ? ' 🏆' : ''}</span><span>${s.score} pts</span></div>`);
    });
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = 'Back to Lobby';
    btn.onclick = () => sendMsg({ t: 'backToLobby' });
    oc.appendChild(btn);
  } else {
    ov.classList.add('hidden');
  }
}

function scoreBlock(r, st) {
  const div = document.createElement('div');
  div.className = 'score-block';
  const title = r.kind === 'crib' ? `${esc(r.name)} — Crib` : esc(r.name) + (r.seat === st.mySeat ? ' (you)' : '');
  div.innerHTML = `<div class="sb-head"><span>${title}</span><span class="sb-total">+${r.total}</span></div>`;
  const cards = document.createElement('div');
  cards.className = 'sb-cards';
  for (const c of r.cards) cards.appendChild(cardEl(c, { small: true }));
  div.appendChild(cards);
  for (const line of r.lines) {
    div.insertAdjacentHTML('beforeend',
      `<div class="sb-line"><span>${esc(line.label)}</span><span>${line.pts == null ? '' : '+' + line.pts}</span></div>`);
  }
  if (!r.lines.length) div.insertAdjacentHTML('beforeend', '<div class="sb-line"><span>Nineteen! (nothing)</span><span>+0</span></div>');
  return div;
}

function renderShop(oc, st) {
  const you = st.you;
  oc.innerHTML = `<h2>Shop</h2><div class="row spread"><span class="shop-coins">🪙 ${you.coins}</span>` +
    `<span style="opacity:.7;font-size:13px">Jokers ${you.jokers.length}/5 · Tarots ${you.tarots.length}/3</span></div>`;
  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  (you.shopOffer || []).forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = `shop-item ${item.kind}` + (item.sold ? ' sold' : '');
    div.innerHTML = `<div class="si-name">${item.kind === 'joker' ? '🃏' : '🔮'} ${esc(item.name)}</div>` +
      `<div class="si-desc">${esc(item.desc)}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn small primary';
    btn.textContent = item.sold ? 'Sold' : `Buy 🪙${item.cost}`;
    btn.disabled = item.sold || you.coins < item.cost || you.ready;
    btn.onclick = () => sendMsg({ t: 'buy', idx });
    div.appendChild(btn);
    grid.appendChild(div);
  });
  oc.appendChild(grid);
  const row = document.createElement('div');
  row.className = 'row';
  const reroll = document.createElement('button');
  reroll.className = 'btn';
  reroll.textContent = 'Reroll 🪙2';
  reroll.disabled = you.coins < 2 || you.ready;
  reroll.onclick = () => sendMsg({ t: 'reroll' });
  row.appendChild(reroll);
  oc.appendChild(row);
  appendReadyBtn(oc, st, 'Next Deal');
}

function appendReadyBtn(oc, st, label) {
  const div = document.createElement('div');
  div.style.marginTop = '12px';
  if (st.you.ready) {
    const waiting = st.players.filter(p => !p.ready && p.connected).map(p => p.name);
    div.innerHTML = `<span style="opacity:.7">Waiting for ${esc(waiting.join(', ') || '…')}</span>`;
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = label;
    btn.onclick = () => sendMsg({ t: 'ready' });
    div.appendChild(btn);
  }
  oc.appendChild(div);
}

connect();
