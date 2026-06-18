// Always-on Discord gateway bot for CineHorizon. Holding an open gateway
// connection is what makes the bot show as ONLINE (green dot). discord.js
// auto-reconnects, and the container restart policy keeps it 24/7.
//
// Responsibilities:
//   - stay online with a presence
//   - idempotently ensure the deploy channel structure exists
//   - register + handle slash commands: /ping, /status, /deploy
//
// Deploy *notifications* during CI are still posted by
// infra/deploy/discord-deploy.mjs — this process is the persistent half.
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !guildId) {
  console.error('DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required');
  process.exit(1);
}
// Optional config for actionable commands; commands degrade gracefully if unset.
const APP_URL = process.env.APP_URL; // e.g. https://cinehorizon-web.onrender.com
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. m4rcel-lol/cinehorizon
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // PAT with workflow scope
const DEPLOY_WORKFLOW = process.env.DEPLOY_WORKFLOW || 'preview.yml'; // free preview env by default

const CATEGORY = 'CINEHORIZON DEPLOYS';
const CHANNELS = [
  { name: 'deploy-status', private: false },
  { name: 'build-logs', private: false },
  { name: 'admin-access', private: true },
];

const COMMANDS = [
  { name: 'ping', description: 'Check the bot is responsive' },
  { name: 'status', description: 'Show bot + app health' },
  { name: 'deploy', description: 'Trigger a production deploy on main (admins only)' },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function ensureStructure(guild) {
  const channels = await guild.channels.fetch();
  let category = channels.find((c) => c?.type === ChannelType.GuildCategory && c.name === CATEGORY);
  if (!category) {
    category = await guild.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory });
  }
  for (const def of CHANNELS) {
    const exists = channels.find(
      (c) => c?.type === ChannelType.GuildText && c.name === def.name && c.parentId === category.id,
    );
    if (exists) continue;
    await guild.channels.create({
      name: def.name,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: def.private
        ? [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
        : undefined,
    });
  }
}

client.once('ready', async () => {
  console.log(`[bot] online as ${client.user.tag}`);
  client.user.setPresence({
    status: 'online',
    activities: [{ name: '/deploy • CineHorizon', type: ActivityType.Watching }],
  });
  try {
    const guild = await client.guilds.fetch(guildId);
    await ensureStructure(guild);
    // Guild commands register instantly (global ones can take ~1h to propagate).
    await guild.commands.set(COMMANDS);
    console.log(`[bot] ${COMMANDS.length} slash commands registered; channel structure ensured`);
  } catch (err) {
    console.error('[bot] setup failed:', err?.message || err);
  }
});

async function handlePing(i) {
  await i.reply(`🏓 Pong! Gateway latency ${Math.max(0, Math.round(client.ws.ping))}ms`);
}

async function handleStatus(i) {
  await i.deferReply();
  const lines = [`🤖 Bot: online as \`${client.user.tag}\``];
  if (!APP_URL) {
    lines.push('🌐 App: URL not configured (set `APP_URL`)');
  } else {
    try {
      const res = await fetch(`${APP_URL.replace(/\/$/, '')}/api/v1/health`, { signal: AbortSignal.timeout(8000) });
      const body = await res.json().catch(() => ({}));
      lines.push(res.ok ? `🟢 App: healthy \`${JSON.stringify(body)}\`` : `🔴 App: HTTP ${res.status}`);
    } catch (e) {
      lines.push(`🔴 App: unreachable (${e.message})`);
    }
  }
  await i.editReply(lines.join('\n'));
}

async function handleDeploy(i) {
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return i.reply({ content: '⛔ Admins only (needs Manage Server).', flags: MessageFlags.Ephemeral });
  }
  if (!GITHUB_REPO || !GITHUB_TOKEN) {
    return i.reply({
      content: '⚙️ Deploy trigger not configured. Set `GITHUB_REPO` and `GITHUB_TOKEN` on the bot.',
      flags: MessageFlags.Ephemeral,
    });
  }
  await i.deferReply();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );
    await i.editReply(
      res.ok
        ? '🚀 Deploy triggered on `main`. Watch <#deploy-status> for live progress.'
        : `❌ Failed to trigger: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`,
    );
  } catch (e) {
    await i.editReply(`❌ Error triggering deploy: ${e.message}`);
  }
}

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  try {
    if (i.commandName === 'ping') return await handlePing(i);
    if (i.commandName === 'status') return await handleStatus(i);
    if (i.commandName === 'deploy') return await handleDeploy(i);
  } catch (err) {
    console.error(`[bot] command ${i.commandName} failed:`, err?.message || err);
    if (i.deferred || i.replied) i.editReply('❌ Command errored.').catch(() => {});
    else i.reply({ content: '❌ Command errored.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

client.on('error', (e) => console.error('[bot] client error:', e?.message || e));
client.on('shardError', (e) => console.error('[bot] shard error:', e?.message || e));

process.on('SIGTERM', () => client.destroy().finally(() => process.exit(0)));
process.on('SIGINT', () => client.destroy().finally(() => process.exit(0)));

client.login(token);
