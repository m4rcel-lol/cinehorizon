import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, ContentStatus, ContentType, Role, VideoQuality, VideoStatus } from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Documentary', 'Romance', 'Thriller', 'Animation', 'Fantasy'];
const sampleHls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

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

  const action = await prisma.genre.findUniqueOrThrow({ where: { slug: 'action' } });
  const drama = await prisma.genre.findUniqueOrThrow({ where: { slug: 'drama' } });
  const scifi = await prisma.genre.findUniqueOrThrow({ where: { slug: 'sci-fi' } });
  const thriller = await prisma.genre.findUniqueOrThrow({ where: { slug: 'thriller' } });
  const fantasy = await prisma.genre.findUniqueOrThrow({ where: { slug: 'fantasy' } });

  for (let i = 1; i <= 5; i++) {
    const title = ['Red Horizon', 'Glass City', 'The Last Signal', 'Midnight Atlas', 'Solar Drift'][i - 1]!;
    const slug = slugify(title);
    const content = await prisma.content.upsert({
      where: { slug },
      update: {},
      create: {
        title,
        slug,
        description: `A cinematic demo movie for CineHorizon. ${title} is seeded with public placeholder images and a sample HLS stream.`,
        type: ContentType.MOVIE,
        releaseYear: 2020 + i,
        ageRating: i % 2 === 0 ? 'PG-13' : 'TV-MA',
        durationMinutes: 96 + i * 7,
        backdropUrl: `https://picsum.photos/seed/cinehorizon-backdrop-${i}/1280/720`,
        posterUrl: `https://picsum.photos/seed/cinehorizon-poster-${i}/342/513`,
        logoUrl: null,
        trailerUrl: sampleHls,
        isFeatured: i === 1,
        isOriginal: i <= 2,
        isTrending: i <= 4,
        isTopTen: i === 2,
        topTenRank: i === 2 ? 1 : null,
        status: ContentStatus.PUBLISHED,
        maturityTags: ['Language', 'Violence'],
        genres: { connect: [{ id: action.id }, { id: i % 2 === 0 ? thriller.id : drama.id }] },
        cast: {
          create: [
            { name: 'Avery Stone', role: 'Director' },
            { name: 'Mira Vale', role: 'Actor', characterName: 'Lead' }
          ]
        },
        videos: {
          create: {
            quality: VideoQuality.FHD_1080,
            url: sampleHls,
            size: BigInt(1024 * 1024 * 100),
            mimeType: 'application/vnd.apple.mpegurl',
            status: VideoStatus.READY
          }
        }
      }
    });
    console.log(`Seeded movie: ${content.title}`);
  }

  for (let i = 1; i <= 2; i++) {
    const title = i === 1 ? 'Nebula Kids' : 'Horizon Files';
    const slug = slugify(title);
    const series = await prisma.content.upsert({
      where: { slug },
      update: {},
      create: {
        title,
        slug,
        description: `${title} is a demo series with two seasons and six sample episodes.`,
        type: ContentType.SERIES,
        releaseYear: 2022 + i,
        ageRating: i === 1 ? 'TV-PG' : 'TV-14',
        durationMinutes: null,
        backdropUrl: `https://picsum.photos/seed/cinehorizon-series-backdrop-${i}/1280/720`,
        posterUrl: `https://picsum.photos/seed/cinehorizon-series-poster-${i}/342/513`,
        trailerUrl: sampleHls,
        isFeatured: false,
        isOriginal: true,
        isTrending: true,
        isTopTen: i === 2,
        topTenRank: i === 2 ? 2 : null,
        status: ContentStatus.PUBLISHED,
        maturityTags: i === 1 ? ['Mild Fantasy Violence'] : ['Mystery', 'Language'],
        genres: { connect: [{ id: i === 1 ? fantasy.id : scifi.id }, { id: drama.id }] },
        cast: { create: [{ name: 'Robin Cross', role: 'Showrunner' }] }
      }
    });

    for (let seasonNo = 1; seasonNo <= 2; seasonNo++) {
      const season = await prisma.season.upsert({
        where: { contentId_number: { contentId: series.id, number: seasonNo } },
        update: {},
        create: { contentId: series.id, number: seasonNo, title: `Season ${seasonNo}` }
      });
      for (let epNo = 1; epNo <= 3; epNo++) {
        const episode = await prisma.episode.upsert({
          where: { seasonId_number: { seasonId: season.id, number: epNo } },
          update: {},
          create: {
            seasonId: season.id,
            number: epNo,
            title: `Episode ${epNo}`,
            description: `Demo episode ${epNo} from ${title} season ${seasonNo}.`,
            durationMinutes: 42,
            thumbnailUrl: `https://picsum.photos/seed/${slug}-s${seasonNo}e${epNo}/320/180`
          }
        });
        const existingVideo = await prisma.video.findFirst({ where: { episodeId: episode.id } });
        if (!existingVideo) {
          await prisma.video.create({
            data: {
              episodeId: episode.id,
              quality: VideoQuality.FHD_1080,
              url: sampleHls,
              size: BigInt(1024 * 1024 * 80),
              mimeType: 'application/vnd.apple.mpegurl',
              status: VideoStatus.READY
            }
          });
        }
      }
    }
  }

  console.log(`Seed complete. Admin: ${admin.email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
