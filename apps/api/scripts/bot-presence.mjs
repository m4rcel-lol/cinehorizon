// Keeps the Discord bot showing as "Online". A bot is only online while a
// process holds a gateway (WebSocket) connection open — the REST reporter in
// infra/deploy/discord-deploy.mjs does not, so this runs alongside the API in
// the always-on container (started by start-render.mjs). Presence-only, so it
// uses zero gateway intents.
import WebSocket from 'ws';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.log('[presence] DISCORD_BOT_TOKEN not set; skipping presence connection');
  process.exit(0);
}

const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const STATUS = process.env.DISCORD_PRESENCE_STATUS || 'online';
const ACTIVITY = process.env.DISCORD_PRESENCE_TEXT || 'CineHorizon deploys';

let ws, heartbeat, seq = null, acked = true;

function connect() {
  ws = new WebSocket(GATEWAY);

  ws.on('message', (raw) => {
    const payload = JSON.parse(raw);
    if (payload.s !== null) seq = payload.s;

    switch (payload.op) {
      case 10: { // Hello -> start heartbeat + identify
        const interval = payload.d.heartbeat_interval;
        clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          if (!acked) { ws.terminate(); return; } // zombie connection -> reconnect
          acked = false;
          ws.send(JSON.stringify({ op: 1, d: seq }));
        }, interval);
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: TOKEN,
            intents: 0,
            properties: { os: 'linux', browser: 'cinehorizon', device: 'cinehorizon' },
            presence: {
              activities: [{ name: ACTIVITY, type: 3 }], // 3 = Watching
              status: STATUS,
              since: 0,
              afk: false,
            },
          },
        }));
        break;
      }
      case 1: // server asked for an immediate heartbeat
        ws.send(JSON.stringify({ op: 1, d: seq }));
        break;
      case 11: // heartbeat ack
        acked = true;
        break;
      case 9: // invalid session -> reconnect fresh
        ws.close();
        break;
    }
  });

  ws.on('open', () => console.log('[presence] gateway connected; status =', STATUS));
  ws.on('close', (code) => {
    console.log('[presence] gateway closed', code, '- reconnecting in 5s');
    clearInterval(heartbeat);
    setTimeout(connect, 5000);
  });
  ws.on('error', (err) => console.error('[presence] error', err.message));
}

connect();
