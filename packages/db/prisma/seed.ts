import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Documentary', 'Romance', 'Thriller', 'Animation', 'Fantasy'];
const legacyDemoSlugs = [
  'red-horizon',
  'glass-city',
  'the-last-signal',
  'midnight-atlas',
  'solar-drift',
  'nebula-kids',
  'horizon-files'
];

async function main() {
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@cinehorizon.local';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe123!';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, isVerified: true },
    create: {
      email: adminEmail,
      displayName: 'CineHorizon Admin',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: Role.ADMIN,
      isVerified: true,
      profiles: { create: { name: 'Admin', avatarIndex: 0 } }
    }
  });

  for (const name of genres) {
    await prisma.genre.upsert({ where: { slug: slugify(name) }, update: {}, create: { name, slug: slugify(name) } });
  }

  const removed = await prisma.content.deleteMany({ where: { slug: { in: legacyDemoSlugs } } });

  console.log(`Seed complete. Admin: ${admin.email}. Removed legacy demo titles: ${removed.count}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
