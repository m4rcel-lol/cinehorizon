import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
const app = createApp();
const server = app.listen(env.PORT, () => {
    console.log(`CineHorizon API listening on ${env.PORT}`);
});
async function shutdown() {
    server.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
//# sourceMappingURL=server.js.map