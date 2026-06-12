# Crib

Online multiplayer cribbage (2–6 players) with Balatro-style jokers and tarot cards.
Node.js + WebSocket server, vanilla JS client, no build step.

## Run

```
npm install
npm start          # http://localhost:3000
```

Set `PORT` to change the port. Everyone joins from a browser, picks a name,
and either creates a table or joins an open one from the lobby list.

## How a match works

- **Match length** is measured in dealer rotations, Balatro-ante style:
  the deal goes fully around the table **3× with 2 players, 2× with 3–4,
  1× with 5–6**. When the last crib is counted, highest total score wins —
  there is no race to 121.
- **Deal sizes:** 2p — 6 cards, discard 2; 3p — 5 cards, discard 1 plus one
  deck card to the crib; 4p — 5 cards, discard 1; 5–6p — 5 cards, discard 1
  (the crib runs oversized, a nice dealer bonus).
- Standard cribbage otherwise: cut a starter (His Heels for the dealer on a
  Jack), peg to 31 with fifteens/pairs/runs/go, then count hands and crib.

## Jokers & tarots

- After each deal everyone earns **coins** (3 + 1 per 5 points scored that
  deal) and a personal **shop** opens: 2 jokers + 2 tarots, reroll for 2.
- **Jokers** (max 5) are passive and warp your scoring — fifteens worth 3,
  doubled pegging, a fattened crib, coins on every cut, etc.
- **Tarots** (max 3) are one-shot consumables, used **during the discard
  phase before you discard**: bump a card's rank, copy one card onto
  another, change suits for a flush, redraw your whole hand…

## Table rules of the UI

- You sit at the bottom; opponents are arranged around the table and you
  only ever see the backs of their cards (played pegging cards are face up,
  as in real cribbage).
- Your jokers and tarots live on your own screen; opponents see only counts
  (hover a player to see which jokers they own — they're public, like
  Balatro's joker row).
- Disconnected players are auto-played after a short grace period and can
  rejoin from the lobby with the same name to reclaim their seat.

## Layout

```
server.js        HTTP static server + WebSocket rooms/lobby
lib/cards.js     deck + card helpers
lib/scoring.js   hand scoring breakdown + pegging events
lib/jokers.js    joker/tarot definitions, modifier aggregation, shop offers
lib/game.js      server-authoritative game state machine
public/          vanilla JS client (index.html, client.js, style.css)
test/smoke.js    headless bot game over real websockets
```

`npm test` runs the smoke test: bots create a room, join, and play full
matches (2 and 5 players) to game over.
