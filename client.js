import { JOKER_ICONS, TAROT_ICONS, PACK_ICONS } from './icons.js';

const $ = id => document.getElementById(id);
const SUIT_CHARS = ['♥', '♦', '♣', '♠']; // H D C S
const RANK_NAMES = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const PEER_PREFIX = 'orbcrib-v1-';
const TOUCH = 'ontouchstart' in window;

// GitHub Pages (or any static host) has no WebSocket server: use P2P rooms.
const P2P_MODE = location.hostname.endsWith('github.io') ||
  new URLSearchParams(location.search).has('p2p');

let ws = null;
let wsOpen = false;
let hostSession = null;   // P2P: I am the host (game runs in this tab)
let guestConn = null;     // P2P: I am a guest
let guestPeer = null;
let myRoomId = null;
let lastState = null;
let prevState = null;
let selected = [];        // card ids picked for discard
let tarotMode = null;     // { idx, def, targets: [] }
let view = 'lobby';
let pendingFly = null;    // { cardId, rect } captured when I click a peg card
let revealShown = -1;     // last scoring result index already animated
let revealKey = '';
let deckOpen = false;     // deck viewer overlay

// Joker drag state
let dragJokerIdx = -1;

// ---- transport ----

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    wsOpen = true;
    const savedRoom = sessionStorage.getItem('crib_room');
    const name = localStorage.getItem('crib_name');
    if (savedRoom && name) {
      ws.send(JSON.stringify({ t: 'joinRoom', roomId: savedRoom, playerName: name }));
    }
  };
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => {
    wsOpen = false;
    toast('Connection lost — reconnecting…');
    setTimeout(connectWs, 2000);
  };
}

function sendMsg(msg) {
  if (hostSession) hostSession.handleLocal(msg);
  else if (guestConn && guestConn.open) guestConn.send(msg);
  else if (wsOpen) ws.send(JSON.stringify(msg));
}

async function hostTable() {
  const { HostSession, makeCode } = await import('./net/host.js');
  const code = makeCode();
  hostSession = new HostSession(code, myName(), msg => handle(msg), (status, detail) => {
    if (status === 'code-taken') { hostSession = null; toast('Code collision — try again.'); }
    else if (status === 'error') { hostSession = null; toast('Connection service error: ' + detail); showView('lobby'); }
  });
  hostSession.peer.on('error', err => {
    console.warn('Host PeerJS error:', err.type);
    toast('Connection service error: ' + err.type);
  });
}

function joinByCode(code) {
  code = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return toast('Codes are 5 letters/digits.');
  sessionStorage.setItem('crib_code', code);
  guestPeer = new Peer({ debug: 1 });
  toast('Connecting…');
  guestPeer.on('open', () => {
    guestConn = guestPeer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    const failTimer = setTimeout(() => { if (!guestConn.open) dropGuest('No table found with that code.'); }, 8000);
    guestConn.on('open', () => {
      clearTimeout(failTimer);
      guestConn.send({ t: 'joinRoom', playerName: myName() });
    });
    guestConn.on('data', msg => handle(msg));
    guestConn.on('close', () => dropGuest('Connection to the host was lost.'));
    guestConn.on('error', () => dropGuest('Could not reach the host.'));
  });
  guestPeer.on('error', err => {
    if (err.type === 'peer-unavailable') dropGuest('No table found with that code.');
    else dropGuest('Connection error: ' + err.type);
  });
}

function dropGuest(reason) {
  if (!guestPeer) return;
  try { guestPeer.destroy(); } catch { /* gone */ }
  guestPeer = null; guestConn = null;
  toast(reason);
  showView('lobby');
}

function leaveP2p() {
  if (hostSession) { hostSession.destroy('Host closed the table.'); hostSession = null; }
  else if (guestPeer) { try { guestPeer.destroy(); } catch { /* gone */ } guestPeer = null; guestConn = null; }
  showView('lobby');
}

window.addEventListener('beforeunload', () => {
  if (hostSession) hostSession.destroy('Host closed the table.');
});

function handle(msg) {
  switch (msg.t) {
    case 'rooms':
      if (view === 'lobby' && !P2P_MODE) renderRoomList(msg.rooms);
      break;
    case 'joined':
      myRoomId = msg.roomId;
      if (!P2P_MODE) sessionStorage.setItem('crib_room', msg.roomId);
      $('log').innerHTML = '';
      (msg.logs || []).forEach(addLog);
      break;
    case 'roomUpdate':
      showView('waiting');
      renderWaiting(msg);
      break;
    case 'state':
      showView('game');
      prevState = lastState;
      lastState = msg.state;
      renderGame(msg.state);
      runAnimations(prevState, msg.state);
      break;
    case 'log':
      addLog(msg.text);
      break;
    case 'error':
      toast(msg.text);
      break;
    case 'hostLeft':
      dropGuest(msg.text || 'The host closed the table.');
      break;
    case 'left':
      myRoomId = null;
      sessionStorage.removeItem('crib_room');
      hostSession = null;
      if (guestPeer) { try { guestPeer.destroy(); } catch { /* gone */ } guestPeer = null; guestConn = null; }
      showView('lobby');
      if (!P2P_MODE) renderRoomList(msg.rooms || []);
      break;
  }
}

// ---- views ----

function showView(v) {
  view = v;
  $('lobby').classList.toggle('hidden', v !== 'lobby');
  $('waiting').classList.toggle('hidden', v !== 'waiting');
  $('game').classList.toggle('hidden', v !== 'game');
  if (v !== 'game') {
    $('overlay').classList.add('hidden');
    lastState = prevState = null;
    document.body.classList.remove('my-turn');
  }
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
  if (text.startsWith('---') || text.startsWith('===')) div.className = 'hl';
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

if (P2P_MODE) {
  $('wsPanel').classList.add('hidden');
  $('roomsPanel').classList.add('hidden');
  $('p2pPanel').classList.remove('hidden');
  $('codeInput').value = sessionStorage.getItem('crib_code') || '';
  $('hostBtn').onclick = () => {
    if (!myName()) return toast('Enter a name first.');
    hostTable();
  };
  $('joinCodeBtn').onclick = () => {
    if (!myName()) return toast('Enter a name first.');
    joinByCode($('codeInput').value);
  };
} else {
  $('createBtn').onclick = () => {
    if (!myName()) return toast('Enter a name first.');
    sendMsg({ t: 'createRoom', roomName: $('roomNameInput').value.trim() || `${myName()}'s table`, playerName: myName() });
  };
  $('refreshBtn').onclick = () => sendMsg({ t: 'listRooms' });
}

$('soloBtn').onclick = async () => {
  if (!myName()) return toast('Enter a name first.');
  if (P2P_MODE) {
    const { HostSession, makeCode } = await import('./net/host.js');
    hostSession = new HostSession(makeCode(), myName(), msg => handle(msg), () => {}, { solo: true });
  } else {
    sendMsg({ t: 'createSolo', playerName: myName() });
  }
};

$('syncBtn').onclick = () => { sendMsg({ t: 'sync' }); toast('Refreshed.'); };

$('updateBtn').onclick = async () => {
  try {
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
  } catch { /* best effort */ }
  location.reload();
};

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
  $('waitCode').innerHTML = msg.code
    ? `Share this code: <b class="code">${esc(msg.code)}</b>`
    : '';
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
  $('waitHint').textContent = n < 2
    ? 'Waiting for at least 2 players…'
    : `${n} players. Each round, beat the blind or you're out — last one standing wins.`;
}

$('startBtn').onclick = () => sendMsg({ t: 'startGame' });
$('leaveBtn').onclick = () => { if (P2P_MODE) leaveP2p(); else sendMsg({ t: 'leaveRoom' }); };

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
  $('dealInfo').textContent = `Round ${st.round} · Deal ${st.dealIndexInRound}/${st.dealsInRound}`;
  $('phaseInfo').textContent = phaseLabel(st);
  const turnP = st.players.find(p => p.seat === st.turnSeat);
  $('turnInfo').textContent =
    st.phase === 'pegging' && turnP ? (turnP.seat === st.mySeat ? '▶ Your turn' : `▶ ${turnP.name}'s turn`) : '';

  const myMove = !!st.you && st.you.active &&
    ((st.phase === 'pegging' && st.turnSeat === st.mySeat) || st.you.canDiscard);
  document.body.classList.toggle('my-turn', myMove);

  renderBlindBar(st);
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
    case 'roundEnd': return 'Blind check';
    case 'shop': return 'Shop';
    case 'gameover': return 'Game over';
    default: return '';
  }
}

// ---- blind progress bar ----

function renderBlindBar(st) {
  const el = $('blindProgress');
  const fill = $('blindBarFill');
  const label = $('blindBarLabel');

  if (!st.you || !st.you.active) {
    el.classList.add('out-label');
    label.textContent = '☠ OUT — spectating';
    label.style.color = '#ff7b6e';
    fill.style.width = '0%';
    fill.className = '';
    return;
  }

  el.classList.remove('out-label');
  const pct = Math.min(100, Math.round(100 * st.you.roundScore / st.blind));
  fill.style.width = pct + '%';

  // Color classes based on progress
  fill.className = '';
  if (pct >= 100) fill.classList.add('done');
  else if (pct >= 75) fill.classList.add('high');
  else if (pct >= 45) fill.classList.add('mid');

  label.style.color = '';
  label.textContent = `${st.you.roundScore} / ${st.blind}  ·  Blind`;
}

function renderSeats(st) {
  const el = $('seats');
  el.innerHTML = '';
  const n = st.players.length;
  const opponents = st.players.filter(p => p.seat !== st.mySeat);
  opponents.sort((a, b) =>
    ((a.seat - st.mySeat + n) % n) - ((b.seat - st.mySeat + n) % n));
  opponents.forEach((p, i) => {
    const k = opponents.length;
    const ang = (180 + (i + 1) * 180 / (k + 1)) * Math.PI / 180;
    const x = 50 + 42 * Math.cos(ang);
    const y = 52 + 46 * Math.sin(ang);
    const seat = document.createElement('div');
    seat.className = 'seat' + (p.seat === st.turnSeat ? ' turn' : '')
      + (p.connected ? '' : ' off') + (p.active ? '' : ' out');
    seat.dataset.seat = p.seat;
    seat.style.left = x + '%';
    seat.style.top = y + '%';

    const badges = [];
    if (!p.active) {
      badges.push(`☠ out round ${p.eliminatedRound}`);
    } else {
      badges.push(`🎯${p.roundScore}/${st.blind}`);
      if (p.jokers.length) badges.push(`🃏${p.jokers.length}`);
      if (p.tarotCount) badges.push(`🔮${p.tarotCount}`);
      badges.push(`🪙${p.coins}`);
      if (st.phase === 'discard') badges.push(p.discarded ? '✓' : '…');
      if ((st.phase === 'scoring' || st.phase === 'shop' || st.phase === 'roundEnd') && p.ready) badges.push('✓');
    }

    const plaque = document.createElement('div');
    plaque.className = 'plaque';
    plaque.innerHTML =
      `<span class="nm">${esc(p.name)}${p.isBot ? ' 🤖' : ''}</span> ${p.isDealer && p.active ? '<span class="dealer-chip">D</span>' : ''}` +
      ` <span class="sc">${p.score}</span><div class="badges">${badges.join(' ')}</div>`;
    if (p.jokers.length) {
      plaque.title = 'Jokers: ' + p.jokers.join(', ');
      if (TOUCH) plaque.onclick = () => toast(`${p.name}'s jokers: ${p.jokers.join(', ')}`);
    }
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
    `<div class="lbl">Crib ×${st.cribCount} (${esc(dealer ? dealer.name : '')})</div>`);

  const stack = $('pegStack');
  stack.innerHTML = '';
  for (const c of st.pegStack) stack.appendChild(cardEl(c));
  $('pegCount').textContent = st.phase === 'pegging' ? st.pegCount : '';
}

// joker/tarot rendered as a little card tile, Balatro-row style
function jtile(kind, def, opts = {}) {
  const d = document.createElement('div');
  d.className = 'jtile ' + kind;
  const icon = (kind === 'joker' ? JOKER_ICONS : TAROT_ICONS)[def.id] || '';
  d.innerHTML = `<span class="jt-icon">${icon}</span><span class="jt-name">${esc(def.name)}</span>` +
    `<div class="tip">${esc(def.desc)}${opts.tipExtra || ''}</div>`;
  return d;
}

function renderMyArea(st) {
  const you = st.you;
  const me = st.players.find(p => p.seat === st.mySeat);
  $('myName').innerHTML = `${esc(me.name)} ${me.isDealer && me.active ? '<span class="dealer-chip">D</span>' : ''}`;
  $('myScore').textContent = `${you.score} pts`;
  $('myCoins').textContent = `🪙 ${you.coins}`;
  $('deckBtn').textContent = `🂠 ${you.deck.length}`;

  renderJokerSlots(st);
  renderTarotSlots(st);
  renderHand(st);
  if (deckOpen) renderDeckOverlay(st);
}

// ---- joker slots (5 fixed, drag-to-reorder) ----

function renderJokerSlots(st) {
  const you = st.you;
  $('jokerCount').textContent = `${you.jokers.length}/5`;

  const slots = $('jokerRow').querySelectorAll('.jslot');
  slots.forEach((slot, i) => {
    // Clear previous content
    slot.innerHTML = '';
    slot.className = 'jslot';
    slot.dataset.slot = i;

    if (i < you.jokers.length) {
      const j = you.jokers[i];
      slot.classList.add('filled');
      const tile = jtile('joker', j);

      // Drag-and-drop for reordering
      tile.draggable = true;
      tile.addEventListener('dragstart', (e) => {
        dragJokerIdx = i;
        tile.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      tile.addEventListener('dragend', () => {
        tile.classList.remove('dragging');
        dragJokerIdx = -1;
        // Clear all drag-over highlights
        slots.forEach(s => s.classList.remove('drag-over'));
      });

      // Touch-based drag info
      if (TOUCH) tile.onclick = () => toast(`${j.name}: ${j.desc}`);

      slot.appendChild(tile);
    } else {
      slot.classList.add('empty');
    }

    // Drop target handlers
    slot.addEventListener('dragover', (e) => {
      if (dragJokerIdx < 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const fromIdx = dragJokerIdx;
      const toIdx = i;
      if (fromIdx < 0 || fromIdx === toIdx) return;
      if (fromIdx < you.jokers.length && toIdx < you.jokers.length) {
        // Swap jokers in the state
        const jokers = you.jokers;
        const temp = jokers[fromIdx];
        jokers[fromIdx] = jokers[toIdx];
        jokers[toIdx] = temp;
        // Re-render
        renderJokerSlots(st);
        // Notify server of reorder
        sendMsg({ t: 'reorderJokers', order: jokers.map(j => j.id) });
      }
      dragJokerIdx = -1;
    });
  });
}

// ---- tarot slots (2 fixed) ----

function renderTarotSlots(st) {
  const you = st.you;
  $('tarotCount').textContent = `${you.tarots.length}/2`;

  const slots = $('tarotRow').querySelectorAll('.tslot');
  slots.forEach((slot, i) => {
    slot.innerHTML = '';
    slot.className = 'tslot';
    slot.dataset.slot = i;

    if (i < you.tarots.length) {
      const t = you.tarots[i];
      slot.classList.add('filled');
      const tile = jtile('tarot', t, {
        tipExtra: you.canDiscard ? '<br><i>Click to use</i>' : '<br><i>Usable before you discard</i>',
      });
      if (you.canDiscard) tile.onclick = () => startTarot(i, t);
      else if (TOUCH) tile.onclick = () => toast(`${t.name}: ${t.desc} (usable before you discard)`);
      slot.appendChild(tile);
    } else {
      slot.classList.add('empty');
    }
  });
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
        el.onclick = () => {
          pendingFly = { cardId: c.id, rect: el.getBoundingClientRect() };
          sendMsg({ t: 'playCard', card: c.id });
        };
      } else {
        el.classList.add('dim');
      }
    }
    handEl.appendChild(el);
  }

  const prompt = $('prompt');
  const btn = $('actionBtn');
  const cancel = $('cancelBtn');
  btn.classList.add('hidden');
  cancel.classList.add('hidden');
  prompt.textContent = '';

  if (!you.active) {
    prompt.textContent = "You're out — spectating the table.";
  } else if (tarotMode) {
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

// ---- deck viewer ----

$('deckBtn').onclick = () => {
  deckOpen = !deckOpen;
  if (deckOpen && lastState) renderDeckOverlay(lastState);
  else $('deckOverlay').classList.add('hidden');
};
$('deckClose').onclick = () => { deckOpen = false; $('deckOverlay').classList.add('hidden'); };
$('deckOverlay').onclick = e => {
  if (e.target === $('deckOverlay')) { deckOpen = false; $('deckOverlay').classList.add('hidden'); }
};

function renderDeckOverlay(st) {
  $('deckOverlay').classList.remove('hidden');
  const body = $('deckBody');
  const deck = st.you.deck;
  $('deckTitle').textContent = `Your deck — ${deck.length} cards`;
  body.innerHTML = '';
  for (let s = 0; s < 4; s++) {
    const cards = deck.filter(c => c.suit === s);
    const row = document.createElement('div');
    row.className = 'deck-row';
    row.innerHTML = `<span class="deck-suit ${s < 2 ? 'red' : ''}">${SUIT_CHARS[s]}<b>${cards.length}</b></span>`;
    const wrap = document.createElement('div');
    wrap.className = 'deck-cards';
    for (const c of cards) wrap.appendChild(cardEl(c, { small: true }));
    row.appendChild(wrap);
    body.appendChild(row);
  }
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

// ---- overlays: scoring, blind check, shop, game over ----

function renderOverlay(st) {
  const ov = $('overlay');
  const oc = $('overlayContent');
  const key = st.phase + '-' + st.dealNumber;
  if (key !== revealKey) { revealShown = -1; revealKey = key; }

  if (st.phase === 'scoring') {
    ov.classList.remove('hidden');
    renderScoring(oc, st);
  } else if (st.phase === 'roundEnd') {
    ov.classList.remove('hidden');
    renderRoundEnd(oc, st);
  } else if (st.phase === 'shop') {
    ov.classList.remove('hidden');
    renderShop(oc, st);
  } else if (st.phase === 'gameover') {
    ov.classList.remove('hidden');
    if (st.solo) {
      const me = (st.standings || []).find(s => s.seat === st.mySeat) || { score: 0 };
      oc.innerHTML = `<h2>Run Over</h2>` +
        `<div class="run-summary">You reached <b>Round ${st.round}</b> against The House.<br>` +
        `Final score: <b>${me.score}</b> · Blinds beaten: <b>${st.you.blindsPassed}</b></div>`;
    } else {
      oc.innerHTML = '<h2>Final Standings</h2>';
      (st.standings || []).forEach((s, i) => {
        const tag = s.eliminatedRound === null ? '🏆 winner' : `out round ${s.eliminatedRound}`;
        oc.insertAdjacentHTML('beforeend',
          `<div class="standing${i === 0 ? ' winner' : ''}"><span>${i + 1}. ${esc(s.name)}</span>` +
          `<span class="standing-tag">${tag}</span><span>${s.score} pts</span></div>`);
      });
    }
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = 'Back to Lobby';
    btn.onclick = () => { if (P2P_MODE) leaveP2p(); else sendMsg({ t: 'backToLobby' }); };
    oc.appendChild(btn);
  } else {
    ov.classList.add('hidden');
  }
}

function renderScoring(oc, st) {
  oc.innerHTML = `<h2>Counting — Deal ${st.dealIndexInRound}/${st.dealsInRound}</h2>` +
    `<div class="starter-row">Starter: </div>`;
  oc.lastChild.appendChild(cardEl(st.starter, { small: true }));

  const done = st.revealIndex >= st.scoringResults.length - 1;
  for (let i = 0; i <= st.revealIndex && i < st.scoringResults.length; i++) {
    const fresh = i > revealShown;
    oc.appendChild(scoreBlock(st.scoringResults[i], st, fresh));
  }
  revealShown = Math.max(revealShown, st.revealIndex);

  if (done) {
    oc.insertAdjacentHTML('beforeend',
      `<div style="margin:8px 0">You earned <b style="color:#ffd76e">🪙 ${st.you.coinGain}</b> this deal.</div>`);
    const last = st.dealIndexInRound >= st.dealsInRound;
    if (st.you.active) appendReadyBtn(oc, st, last ? 'Blind Check' : 'To the Shop');
  } else {
    oc.insertAdjacentHTML('beforeend', '<div class="counting-hint">Counting…</div>');
  }
  oc.scrollTop = oc.scrollHeight;
}

function scoreBlock(r, st, fresh) {
  const div = document.createElement('div');
  div.className = 'score-block' + (fresh ? ' reveal' : '');
  const title = r.kind === 'crib'
    ? `👑 ${esc(r.name)} — Crib`
    : esc(r.name) + (r.seat === st.mySeat ? ' (you)' : '');
  div.innerHTML = `<div class="sb-head"><span>${title}</span><span class="sb-total">+${r.total}</span></div>`;
  const cards = document.createElement('div');
  cards.className = 'sb-cards';
  r.cards.forEach((c, i) => {
    const el = cardEl(c, { small: true });
    if (fresh) { el.classList.add('deal-in'); el.style.animationDelay = (i * 90) + 'ms'; }
    cards.appendChild(el);
  });
  div.appendChild(cards);
  r.lines.forEach((line, i) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'sb-line' + (fresh ? ' anim' : '');
    if (fresh) lineEl.style.animationDelay = (250 + i * 150) + 'ms';
    lineEl.innerHTML = `<span>${esc(line.label)}</span><span>${line.pts == null ? '' : '+' + line.pts}</span>`;
    div.appendChild(lineEl);
  });
  if (!r.lines.length) {
    div.insertAdjacentHTML('beforeend', '<div class="sb-line"><span>Nineteen! (nothing)</span><span>+0</span></div>');
  }
  if (fresh && r.total > 0) {
    countUp(div.querySelector('.sb-total'), r.total, 250 + r.lines.length * 150);
  }
  return div;
}

function countUp(el, total, duration) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = '+' + Math.round(t * total);
    if (t < 1 && el.isConnected) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderRoundEnd(oc, st) {
  const d = st.roundEndData;
  oc.innerHTML = `<h2>Blind Check — Round ${d.round}</h2>` +
    `<div class="blind-target">Blind: <b>${d.blind}</b></div>`;
  if (d.rescued) {
    oc.insertAdjacentHTML('beforeend',
      '<div class="rescued">Nobody beat the blind — top score survives!</div>');
  }
  for (const row of d.rows) {
    const pct = Math.min(100, Math.round(100 * row.roundScore / d.blind));
    oc.insertAdjacentHTML('beforeend',
      `<div class="blind-row${row.passed ? '' : ' failed'}">` +
      `<span class="br-name">${esc(row.name)}${row.seat === st.mySeat ? ' (you)' : ''}</span>` +
      `<div class="br-bar"><div class="br-fill${row.passed ? ' pass' : ''}" style="width:${pct}%"></div></div>` +
      `<span class="br-score">${row.roundScore}/${d.blind}</span>` +
      `<span class="br-tag">${row.passed ? '✅ SAFE' : '☠ ELIMINATED'}</span></div>`);
  }
  const left = st.players.filter(p => p.active).length;
  if (st.solo) {
    oc.insertAdjacentHTML('beforeend',
      '<div class="hint" style="margin-top:10px">The House is exempt — your run lasts as long as you beat the blinds.</div>');
  } else {
    oc.insertAdjacentHTML('beforeend',
      `<div class="hint" style="margin-top:10px">${left <= 1 ? 'We have a winner!' : left + ' players remain.'}</div>`);
  }
  if (st.you.active) appendReadyBtn(oc, st, left <= 1 ? 'Final Standings' : 'Continue');
  else oc.insertAdjacentHTML('beforeend', '<div class="hint">Spectating…</div>');
}

function renderShop(oc, st) {
  const you = st.you;
  if (!you.active) {
    oc.innerHTML = '<h2>Shop</h2><div class="hint">The survivors are shopping… you\'re spectating.</div>';
    return;
  }
  if (you.pendingPack) return renderPackOpen(oc, st);

  oc.innerHTML = `<h2>Shop</h2><div class="row spread"><span class="shop-coins">🪙 ${you.coins}</span>` +
    `<span style="opacity:.7;font-size:13px">Jokers ${you.jokers.length}/5 · Tarots ${you.tarots.length}/2 · Deck ${you.deck.length}</span></div>`;
  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  (you.shopOffer || []).forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = `shop-item ${item.kind}` + (item.sold ? ' sold' : '') + (item.kind === 'pack' ? ' shiny' : '');
    const icon = item.kind === 'joker' ? JOKER_ICONS[item.id]
      : item.kind === 'tarot' ? TAROT_ICONS[item.id]
      : PACK_ICONS[item.id];
    div.innerHTML = `<div class="si-icon">${icon || ''}</div><div class="si-name">${esc(item.name)}</div>` +
      `<div class="si-desc">${esc(item.desc)}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn small primary';
    btn.textContent = item.sold ? (item.kind === 'pack' ? 'Opened' : 'Sold') : `Buy 🪙${item.cost}`;
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
  const nextRound = st.dealIndexInRound >= st.dealsInRound;
  appendReadyBtn(oc, st, nextRound ? `Round ${st.round + 1}` : 'Next Deal');
}

function renderPackOpen(oc, st) {
  const pack = st.you.pendingPack;
  oc.innerHTML = `<h2>✨ ${esc(pack.name)}</h2><div class="hint">Pick one:</div>`;
  const grid = document.createElement('div');
  grid.className = 'shop-grid pack-grid';
  pack.options.forEach((opt, idx) => {
    const div = document.createElement('div');
    const kindCls = opt.kind === 'card' ? 'standardcard' : opt.kind;
    div.className = `shop-item shiny pick ${kindCls}`;
    if (opt.kind === 'card') {
      div.innerHTML = `<div class="si-bigcard"></div><div class="si-name">${RANK_NAMES[opt.rank]}${SUIT_CHARS[opt.suit]} — add to your deck</div>`;
      div.querySelector('.si-bigcard').appendChild(cardEl(opt));
    } else {
      const icon = (opt.kind === 'joker' ? JOKER_ICONS : TAROT_ICONS)[opt.id] || '';
      div.innerHTML = `<div class="si-icon">${icon}</div><div class="si-name">${esc(opt.name)}</div>` +
        `<div class="si-desc">${esc(opt.desc)}</div>`;
    }
    const btn = document.createElement('button');
    btn.className = 'btn small primary';
    btn.textContent = 'Take';
    btn.onclick = () => sendMsg({ t: 'pickPack', idx });
    div.appendChild(btn);
    grid.appendChild(div);
  });
  oc.appendChild(grid);
  const skip = document.createElement('button');
  skip.className = 'btn';
  skip.textContent = 'Skip pack';
  skip.onclick = () => sendMsg({ t: 'pickPack', idx: -1 });
  oc.appendChild(skip);
}

function appendReadyBtn(oc, st, label) {
  const div = document.createElement('div');
  div.style.marginTop = '12px';
  if (st.you.ready) {
    const waiting = st.players.filter(p => p.active && !p.ready && p.connected).map(p => p.name);
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

// ---- animations ----

function runAnimations(prev, st) {
  if (!prev || prev === st) return;

  const newDeal = prev.dealNumber !== st.dealNumber;
  if (newDeal && st.phase === 'discard') {
    const deckRect = $('deckPile').getBoundingClientRect();
    shuffleAnim(deckRect);
    const SHUFFLE_MS = 520;
    document.querySelectorAll('#hand .card').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--dx', (deckRect.left - r.left) + 'px');
      el.style.setProperty('--dy', (deckRect.top - r.top) + 'px');
      el.classList.add('deal-in');
      el.style.animationDelay = (SHUFFLE_MS + i * 80) + 'ms';
    });
    document.querySelectorAll('.seat .backs .card').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--dx', (deckRect.left - r.left) + 'px');
      el.style.setProperty('--dy', (deckRect.top - r.top) + 'px');
      el.classList.add('deal-in');
      el.style.animationDelay = (SHUFFLE_MS + i * 40) + 'ms';
    });
  }

  if (st.starter && !prev.starter) {
    const el = document.querySelector('#starterPile .card');
    if (el) el.classList.add('flip-in');
  }

  // discards glide (face down) from each player's hand to the crib pile
  if (prev.dealNumber === st.dealNumber && prev.players) {
    const cribCard = document.querySelector('#cribPile .card');
    for (const p of st.players) {
      const pp = prev.players.find(q => q.seat === p.seat);
      if (!pp || pp.discarded || !p.discarded || !p.active || !cribCard) continue;
      const fromEl = p.seat === st.mySeat
        ? $('hand')
        : document.querySelector(`.seat[data-seat="${p.seat}"] .backs`) ||
          document.querySelector(`.seat[data-seat="${p.seat}"]`);
      if (!fromEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      for (let i = 0; i < st.discardCount; i++) {
        setTimeout(() => {
          const tgt = document.querySelector('#cribPile .card');
          if (tgt) flyClone(backEl(), fromRect, tgt.getBoundingClientRect(), 420, p.seat === st.mySeat ? -8 : 8);
        }, i * 110);
      }
    }
  }

  if (st.phase === 'pegging' && prev.dealNumber === st.dealNumber &&
      Array.isArray(prev.pegStack) && st.pegStack.length > prev.pegStack.length) {
    const played = st.pegStack[st.pegStack.length - 1];
    const stackCards = document.querySelectorAll('#pegStack .card');
    const target = stackCards[stackCards.length - 1];
    let fromRect = null;
    if (pendingFly && pendingFly.cardId === played.id) {
      fromRect = pendingFly.rect;
    } else {
      const seatEl = document.querySelector(`.seat[data-seat="${played.seat}"] .backs`) ||
        document.querySelector(`.seat[data-seat="${played.seat}"]`);
      if (seatEl) fromRect = seatEl.getBoundingClientRect();
    }
    pendingFly = null;
    if (fromRect && target) flyCard(played, fromRect, target);
    pulse($('pegCount'));
  }

  // a finished 31/go count sweeps off the table
  if (prev.dealNumber === st.dealNumber && Array.isArray(prev.pegStack) &&
      prev.pegStack.length > 1 && st.pegStack.length === 0 &&
      (st.phase === 'pegging' || st.phase === 'scoring')) {
    const area = $('pegStack').getBoundingClientRect();
    prev.pegStack.forEach((c, i) => {
      const clone = cardEl(c);
      clone.classList.add('sweep');
      clone.style.left = (area.left + i * 28) + 'px';
      clone.style.top = area.top + 'px';
      clone.style.animationDelay = (i * 40) + 'ms';
      $('fx').appendChild(clone);
      setTimeout(() => clone.remove(), 700 + i * 40);
    });
  }

  for (const p of st.players) {
    const pp = prev.players && prev.players.find(q => q.seat === p.seat);
    if (pp && p.score > pp.score) {
      floatAtSeat(st, p.seat, `+${p.score - pp.score}`, 'fx-pts');
    }
  }
  if (prev.you && st.you && st.you.coins > prev.you.coins && st.phase !== 'shop') {
    floatAtSeat(st, st.mySeat, `+🪙${st.you.coins - prev.you.coins}`, 'fx-coin');
  }
}

function shuffleAnim(deckRect) {
  for (let i = 0; i < 6; i++) {
    const clone = backEl();
    clone.classList.add('shuffling', i % 2 ? 'shuf-r' : 'shuf-l');
    clone.style.left = deckRect.left + 'px';
    clone.style.top = deckRect.top + 'px';
    clone.style.animationDelay = (i * 45) + 'ms';
    $('fx').appendChild(clone);
    setTimeout(() => clone.remove(), 700 + i * 45);
  }
}

function flyClone(el, fromRect, toRect, ms = 380, rot = 0) {
  el.classList.add('flying');
  el.style.left = fromRect.left + 'px';
  el.style.top = fromRect.top + 'px';
  el.style.transitionDuration = ms + 'ms';
  $('fx').appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform =
      `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px) rotate(${rot}deg)`;
  });
  setTimeout(() => el.remove(), ms + 60);
}

function flyCard(card, fromRect, target) {
  const toRect = target.getBoundingClientRect();
  target.style.visibility = 'hidden';
  flyClone(cardEl(card), fromRect, toRect, 380, 0);
  setTimeout(() => { target.style.visibility = ''; }, 400);
}

function floatAtSeat(st, seat, text, cls) {
  let rect;
  if (seat === st.mySeat) {
    rect = $('myScore').getBoundingClientRect();
  } else {
    const el = document.querySelector(`.seat[data-seat="${seat}"] .plaque`);
    if (!el) return;
    rect = el.getBoundingClientRect();
  }
  const div = document.createElement('div');
  div.className = 'fx-float ' + cls;
  div.textContent = text;
  div.style.left = (rect.left + rect.width / 2) + 'px';
  div.style.top = rect.top + 'px';
  $('fx').appendChild(div);
  div.addEventListener('animationend', () => div.remove());
}

function pulse(el) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

// ---- boot ----

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline shell is optional */ });
}

if (!P2P_MODE) connectWs();
