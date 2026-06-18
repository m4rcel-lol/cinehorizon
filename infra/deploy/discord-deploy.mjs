// Discord deploy reporter. No npm deps — talks to the Discord REST API (v10)
// with the bot token. The bot must already be a member of the guild with the
// "Manage Channels" + "Send Messages" permissions (see infra/deploy/README.md).
//
// On first run it builds its own channel structure under a category:
//   CINEHORIZON DEPLOYS
//     #deploy-status   (live deploy embeds)
//     #build-logs      (links to CI / Render logs)
//     #admin-access    (private: only the bot + admins; receives credentials)
//
// CLI (driven by the GitHub Actions workflow):
//   ensure                         -> create/find channels, emit ids to $GITHUB_OUTPUT
//   start  --sha --branch --actor  -> post the "building" embed, emit message id
//   finish --message --status --url --sha   -> edit the embed to success/failure
//   creds  --email --password --url          -> post credentials to #admin-access
import fs from 'node:fs';

const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;
if (!TOKEN || !GUILD) {
  console.error('DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required');
  process.exit(1);
}

const CATEGORY = 'CINEHORIZON DEPLOYS';
const CHANNELS = { status: 'deploy-status', logs: 'build-logs', creds: 'admin-access' };
const COLORS = { building: 0xf5c518, success: 0x46d369, failure: 0xe50914 };
const VIEW_CHANNEL = 1 << 10; // permission bit for private overwrite

async function discord(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Discord ${method} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

function output(kv) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  } else {
    console.log(kv);
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function ensure() {
  const existing = await discord('GET', `/guilds/${GUILD}/channels`);
  let category = existing.find((c) => c.type === 4 && c.name === CATEGORY);
  if (!category) category = await discord('POST', `/guilds/${GUILD}/channels`, { name: CATEGORY, type: 4 });

  const ids = {};
  for (const [key, name] of Object.entries(CHANNELS)) {
    let ch = existing.find((c) => c.type === 0 && c.name === name && c.parent_id === category.id);
    if (!ch) {
      const payload = { name, type: 0, parent_id: category.id };
      if (key === 'creds') {
        // Private: deny @everyone (role id == guild id) the VIEW_CHANNEL bit.
        payload.permission_overwrites = [{ id: GUILD, type: 0, deny: String(VIEW_CHANNEL) }];
      }
      ch = await discord('POST', `/guilds/${GUILD}/channels`, payload);
    }
    ids[key] = ch.id;
  }
  output({ status_channel: ids.status, logs_channel: ids.logs, creds_channel: ids.creds });
}

async function start() {
  const channel = arg('channel') || process.env.STATUS_CHANNEL;
  const embed = {
    title: '🟡 Deploying CineHorizon',
    color: COLORS.building,
    fields: [
      { name: 'Branch', value: arg('branch') || 'main', inline: true },
      { name: 'Commit', value: (arg('sha') || '').slice(0, 7) || 'unknown', inline: true },
      { name: 'By', value: arg('actor') || 'ci', inline: true },
    ],
    description: 'Build started…',
  };
  const msg = await discord('POST', `/channels/${channel}/messages`, { embeds: [embed] });
  output({ message_id: msg.id });
}

async function finish() {
  const channel = arg('channel') || process.env.STATUS_CHANNEL;
  const messageId = arg('message');
  const ok = arg('status') === 'success';
  const embed = {
    title: ok ? '🟢 Deployed CineHorizon' : '🔴 Deploy failed',
    color: ok ? COLORS.success : COLORS.failure,
    fields: [{ name: 'Commit', value: (arg('sha') || '').slice(0, 7) || 'unknown', inline: true }],
    description: ok
      ? `Live at ${arg('url') || 'the app URL'}`
      : `Build or release failed. Logs: ${arg('url') || 'see GitHub Actions'}`,
  };
  await discord('PATCH', `/channels/${channel}/messages/${messageId}`, { embeds: [embed] });
}

async function creds() {
  const channel = arg('channel') || process.env.CREDS_CHANNEL;
  const embed = {
    title: '🔐 Admin credentials (this deploy)',
    color: COLORS.success,
    description: 'Rotated on every deploy. Treat as sensitive.',
    fields: [
      { name: 'URL', value: `${arg('url') || ''}/admin`, inline: false },
      { name: 'Email', value: '`' + (arg('email') || '') + '`', inline: true },
      { name: 'Password', value: '||`' + (arg('password') || '') + '`||', inline: true },
    ],
  };
  await discord('POST', `/channels/${channel}/messages`, { embeds: [embed] });
}

const cmd = process.argv[2];
const handlers = { ensure, start, finish, creds };
if (!handlers[cmd]) {
  console.error(`Unknown command: ${cmd}. Use: ensure | start | finish | creds`);
  process.exit(1);
}
handlers[cmd]().catch((e) => {
  console.error(e);
  process.exit(1);
});
