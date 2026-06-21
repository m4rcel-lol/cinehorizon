import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role, DownloadCategory, Platform } from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Catalog placeholders so the Games/Software storefront renders out of the box.
// The download files are not seeded on disk, so the catalog renders but the
// actual download link 404s until an admin uploads the real artifact.
const seedDownloads: Array<{
  category: DownloadCategory;
  title: string;
  description: string;
  platform: Platform;
  version: string;
  developer: string;
  genre: string;
  fileSize: bigint;
  isFeatured?: boolean;
  isTrending?: boolean;
  isTopRanked?: boolean;
  rank?: number;
}> = [
  { category: 'SOFTWARE', title: 'Horizon Code', description: 'A fast, extensible code editor with built-in Git, terminals, and a plugin marketplace.', platform: 'MULTI', version: '2.4.1', developer: 'Horizon Labs', genre: 'Developer Tools', fileSize: 96_337_920n, isFeatured: true, isTrending: true, isTopRanked: true, rank: 1 },
  { category: 'SOFTWARE', title: 'PixelForge', description: 'Professional raster and vector image editing with non-destructive layers.', platform: 'WINDOWS', version: '11.0', developer: 'Forge Studio', genre: 'Design', fileSize: 412_876_800n, isTrending: true, isTopRanked: true, rank: 2 },
  { category: 'SOFTWARE', title: 'StreamCast', description: 'Record and live-stream your screen in 4K with scene composition and overlays.', platform: 'MAC', version: '5.7.2', developer: 'CastWorks', genre: 'Media', fileSize: 158_334_976n, isTrending: true },
  { category: 'SOFTWARE', title: 'NoteVault', description: 'Encrypted, offline-first notes and knowledge base with markdown and backlinks.', platform: 'LINUX', version: '3.1.0', developer: 'Vault Inc.', genre: 'Productivity', fileSize: 54_525_952n },
  { category: 'GAME', title: 'Nebula Drift', description: 'A roguellike space shooter with procedurally generated galaxies and co-op.', platform: 'WINDOWS', version: '1.3.0', developer: 'Comet Games', genre: 'Action', fileSize: 2_576_980_377n, isFeatured: true, isTrending: true, isTopRanked: true, rank: 1 },
  { category: 'GAME', title: 'Glasshouse', description: 'A hand-painted narrative puzzle adventure about memory and architecture.', platform: 'MULTI', version: '1.0.4', developer: 'Atrium Studio', genre: 'Puzzle', fileSize: 1_181_116_006n, isTrending: true, isTopRanked: true, rank: 2 },
  { category: 'GAME', title: 'Tidebound', description: 'An open-world survival sailing game with dynamic weather and trading.', platform: 'MAC', version: '0.9.1', developer: 'Saltwind', genre: 'Survival', fileSize: 3_865_470_566n, isTrending: true },
  { category: 'GAME', title: 'Circuit Rush', description: 'A neon arcade racer with split-screen multiplayer and a track editor.', platform: 'LINUX', version: '2.0.0', developer: 'Voltage', genre: 'Racing', fileSize: 912_261_120n }
];

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

  for (const item of seedDownloads) {
    const slug = slugify(item.title);
    const cover = `https://picsum.photos/seed/${slug}/480/640`;
    const fileName = `${slug}-${item.version}.zip`;
    const storageKey = `downloads/${item.category.toLowerCase()}/${slug}/${fileName}`;
    await prisma.download.upsert({
      where: { category_slug: { category: item.category, slug } },
      update: {
        isFeatured: item.isFeatured ?? false,
        isTrending: item.isTrending ?? false,
        isTopRanked: item.isTopRanked ?? false,
        rank: item.rank ?? null
      },
      create: {
        category: item.category,
        title: item.title,
        slug,
        description: item.description,
        platform: item.platform,
        version: item.version,
        developer: item.developer,
        genre: item.genre,
        coverImageUrl: cover,
        fileName,
        fileUrl: `/media/${storageKey}`,
        storageKey,
        fileSize: item.fileSize,
        downloadCount: 0,
        isPublished: true,
        isFeatured: item.isFeatured ?? false,
        isTrending: item.isTrending ?? false,
        isTopRanked: item.isTopRanked ?? false,
        rank: item.rank ?? null
      }
    });
  }

  console.log(`Seed complete. Admin: ${admin.email}. Removed legacy demo titles: ${removed.count}. Seeded ${seedDownloads.length} download placeholders.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
