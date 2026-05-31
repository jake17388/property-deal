# Property Deal

A real-time multiplayer card game for 2–5 players, inspired by Monopoly Deal. Built as a PWA with React + Vite on the frontend and a Node.js + Socket.IO game server on the backend.

## Running locally

```bash
npm install
npm run dev
```

This starts both the game server (port 3001) and the Vite dev server (port 5173) concurrently. Open `http://localhost:5173` in your browser.

To run them separately:

```bash
npm run dev:server   # game server on :3001
npm run dev:client   # vite frontend on :5173
```

## Environment variables

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the game server listens on |
| `CORS_ORIGINS` | localhost + Vercel URL | Comma-separated list of allowed frontend origins |
| `VITE_SERVER_URL` | `http://localhost:3001` | Backend URL used by the frontend (set at build time) |

## Deploying

The frontend can be deployed to **Vercel** (set `VITE_SERVER_URL` to your backend URL as a build env var).

The backend (`server.js`) needs a persistent Node.js host — **Render**, **Railway**, or **Fly.io** all have free tiers that work. Set `PORT` and `CORS_ORIGINS` as environment variables on the host.

The `Procfile` (`web: node server.js`) is compatible with Heroku-style platforms.

## How to play

- Create a room, share the room code with friends
- The host starts the game once everyone has joined
- Each turn: draw 2 cards, play up to 3 cards, end your turn
- First player to collect **3 complete property sets** wins

## Tech stack

- **Frontend**: React 19, Vite, Tailwind CSS, Socket.IO client
- **Backend**: Node.js, Express 5, Socket.IO
- **Game logic**: Pure JS in `src/game/engine.js` and `src/game/cards.js`
