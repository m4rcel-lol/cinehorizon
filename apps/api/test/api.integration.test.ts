import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { sha256 } from '../src/lib/crypto.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://cinehorizon:test@localhost:5432/cinehorizon_test';
process.env.JWT_PRIVATE_KEY_PATH = './test-private.pem';
process.env.JWT_PUBLIC_KEY_PATH = './test-public.pem';
process.env.BASE_URL = 'http://localhost';
process.env.WEB_ORIGIN = 'http://localhost';
process.env.ADMIN_ORIGIN = 'http://localhost/admin';

type Role = 'USER' | 'ADMIN';
type ContentType = 'MOVIE' | 'SERIES';
type ContentStatus = 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProfileRecord {
  id: string;
  userId: string;
  name: string;
  avatarIndex: number;
  isKids: boolean;
  createdAt: Date;
}

interface SessionRecord {
  id: string;
  userId: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  createdAt: Date;
}

interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface GenreRecord {
  id: string;
  name: string;
  slug: string;
}

interface CastMemberRecord {
  id: string;
  contentId: string;
  name: string;
  role: string;
  characterName: string | null;
}

interface ContentRecord {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: ContentType;
  releaseYear: number;
  ageRating: string;
  durationMinutes: number | null;
  backdropUrl: string;
  posterUrl: string;
  logoUrl: string | null;
  trailerUrl: string | null;
  isFeatured: boolean;
  isOriginal: boolean;
  isTrending: boolean;
  isTopTen: boolean;
  topTenRank: number | null;
  status: ContentStatus;
  maturityTags: string[];
  createdAt: Date;
  updatedAt: Date;
  genreIds: string[];
}

interface WatchlistRecord {
  profileId: string;
  contentId: string;
  addedAt: Date;
}

type DownloadCategory = 'GAME' | 'SOFTWARE';

interface DownloadRecord {
  id: string;
  category: DownloadCategory;
  title: string;
  slug: string;
  description: string;
  platform: string;
  version: string | null;
  developer: string | null;
  genre: string | null;
  coverImageUrl: string;
  fileName: string;
  fileUrl: string;
  storageKey: string;
  fileSize: bigint;
  downloadCount: number;
  isPublished: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  isTopRanked: boolean;
  rank: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestDb {
  users: UserRecord[];
  profiles: ProfileRecord[];
  sessions: SessionRecord[];
  verificationTokens: EmailVerificationTokenRecord[];
  passwordResetTokens: EmailVerificationTokenRecord[];
  genres: GenreRecord[];
  cast: CastMemberRecord[];
  content: ContentRecord[];
  watchlist: WatchlistRecord[];
  downloads: DownloadRecord[];
}

interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
}

type JsonObject = Record<string, unknown>;

const state = vi.hoisted(() => {
  const db: TestDb = {
    users: [],
    profiles: [],
    sessions: [],
    verificationTokens: [],
    passwordResetTokens: [],
    genres: [],
    cast: [],
    content: [],
    watchlist: [],
    downloads: []
  };
  const tokens = new Map<string, AccessPayload>();
  let counter = 0;
  return {
    db,
    tokens,
    nextId(prefix: string) {
      counter += 1;
      return `${prefix}_${counter}`;
    },
    reset() {
      db.users = [];
      db.profiles = [];
      db.sessions = [];
      db.verificationTokens = [];
      db.passwordResetTokens = [];
      db.genres = [];
      db.cast = [];
      db.content = [];
      db.watchlist = [];
      db.downloads = [];
      tokens.clear();
      counter = 0;
    }
  };
});

function now() {
  return new Date();
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string') throw new Error(`Expected string field ${field}`);
  return value;
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value !== 'number') throw new Error(`Expected number field ${field}`);
  return value;
}

function optionalBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function record(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected object field ${field}`);
  return value as JsonObject;
}

function arrayOfObjects(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function userWithProfiles(user: UserRecord) {
  return { ...user, profiles: state.db.profiles.filter((profile) => profile.userId === user.id) };
}

function contentWithRelations(content: ContentRecord) {
  return {
    ...content,
    genres: state.db.genres.filter((genre) => content.genreIds.includes(genre.id)),
    cast: state.db.cast.filter((member) => member.contentId === content.id)
  };
}

function getWhere(query: JsonObject) {
  const where = query.where;
  return where && typeof where === 'object' && !Array.isArray(where) ? where as JsonObject : {};
}

function getData(query: JsonObject) {
  return record(query.data, 'data');
}

async function seedAdmin() {
  const user: UserRecord = {
    id: state.nextId('user'),
    email: 'admin@cinehorizon.test',
    passwordHash: await bcrypt.hash('AdminPass123!', 12),
    displayName: 'Admin',
    avatarUrl: null,
    role: 'ADMIN',
    isVerified: true,
    createdAt: now(),
    updatedAt: now()
  };
  state.db.users.push(user);
  state.db.profiles.push({ id: state.nextId('profile'), userId: user.id, name: 'Admin', avatarIndex: 0, isKids: false, createdAt: now() });
  return user;
}

function seedGenre() {
  const genre = { id: state.nextId('genre'), name: 'Drama', slug: 'drama' };
  state.db.genres.push(genre);
  return genre;
}

function seedPublishedContent() {
  const genre = seedGenre();
  const content: ContentRecord = {
    id: state.nextId('content'),
    title: 'Seed Movie',
    slug: 'seed-movie',
    description: 'A seeded movie.',
    type: 'MOVIE',
    releaseYear: 2024,
    ageRating: 'PG-13',
    durationMinutes: 100,
    backdropUrl: 'https://example.test/backdrop.jpg',
    posterUrl: 'https://example.test/poster.jpg',
    logoUrl: null,
    trailerUrl: null,
    isFeatured: false,
    isOriginal: false,
    isTrending: false,
    isTopTen: false,
    topTenRank: null,
    status: 'PUBLISHED',
    maturityTags: [],
    createdAt: now(),
    updatedAt: now(),
    genreIds: [genre.id]
  };
  state.db.content.push(content);
  return content;
}

function seedDownload(overrides: Partial<DownloadRecord> = {}) {
  const title = overrides.title ?? 'Seed App';
  const slug = overrides.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const download: DownloadRecord = {
    id: state.nextId('download'),
    category: 'SOFTWARE',
    title,
    slug,
    description: 'A seeded download.',
    platform: 'WINDOWS',
    version: '1.0.0',
    developer: 'Seed Studio',
    genre: 'Productivity',
    coverImageUrl: 'https://example.test/cover.jpg',
    fileName: `${slug}.zip`,
    fileUrl: `/media/downloads/${slug}.zip`,
    storageKey: `downloads/software/${slug}/${slug}.zip`,
    fileSize: 1024n,
    downloadCount: 0,
    isPublished: true,
    isFeatured: false,
    isTrending: false,
    isTopRanked: false,
    rank: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
  state.db.downloads.push(download);
  return download;
}

function matchDownloadWhere(download: DownloadRecord, where: JsonObject) {
  if (typeof where.isPublished === 'boolean' && download.isPublished !== where.isPublished) return false;
  if (typeof where.category === 'string' && download.category !== where.category) return false;
  if (typeof where.platform === 'string' && download.platform !== where.platform) return false;
  if (typeof where.isFeatured === 'boolean' && download.isFeatured !== where.isFeatured) return false;
  if (typeof where.isTrending === 'boolean' && download.isTrending !== where.isTrending) return false;
  if (typeof where.isTopRanked === 'boolean' && download.isTopRanked !== where.isTopRanked) return false;
  return true;
}

vi.mock('../src/lib/jwt.js', () => ({
  signAccessToken(payload: AccessPayload) {
    const token = `access-${payload.sub}-${state.tokens.size + 1}`;
    state.tokens.set(token, payload);
    return token;
  },
  verifyAccessToken(token: string) {
    const payload = state.tokens.get(token);
    if (!payload) throw new Error('bad token');
    return payload;
  }
}));

vi.mock('../src/lib/redis.js', () => ({ redis: { ping: vi.fn(async () => 'PONG') } }));
vi.mock('../src/queues/transcodeQueue.js', () => ({ transcodeQueue: { add: vi.fn(async () => undefined) } }));
vi.mock('../src/services/storage.js', () => ({
  resolvePlaybackUrl: vi.fn(async (value: string) => value),
  deleteObjectByKey: vi.fn(async () => undefined),
  toRelativeMediaUrl: (value: unknown) =>
    typeof value === 'string' ? value.replace(/^https?:\/\/[^/]+(?=\/media\/)/i, '') : value
}));

vi.mock('../src/lib/prisma.js', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const user = typeof where.email === 'string'
          ? state.db.users.find((item) => item.email === where.email)
          : state.db.users.find((item) => item.id === where.id);
        if (!user) return null;
        return record(query.include ?? {}, 'include').profiles ? userWithProfiles(user) : { ...user };
      }),
      findUniqueOrThrow: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const user = state.db.users.find((item) => item.id === where.id);
        if (!user) throw new Error('User not found');
        return record(query.include ?? {}, 'include').profiles ? userWithProfiles(user) : { ...user };
      }),
      create: vi.fn(async (query: JsonObject) => {
        const data = getData(query);
        const user: UserRecord = {
          id: state.nextId('user'),
          email: requiredString(data.email, 'email'),
          passwordHash: requiredString(data.passwordHash, 'passwordHash'),
          displayName: requiredString(data.displayName, 'displayName'),
          avatarUrl: null,
          role: data.role === 'ADMIN' ? 'ADMIN' : 'USER',
          isVerified: data.isVerified === true,
          createdAt: now(),
          updatedAt: now()
        };
        state.db.users.push(user);
        const profileCreate = record(record(data.profiles, 'profiles').create, 'profiles.create');
        state.db.profiles.push({
          id: state.nextId('profile'),
          userId: user.id,
          name: requiredString(profileCreate.name, 'profile.name'),
          avatarIndex: requiredNumber(profileCreate.avatarIndex ?? 0, 'profile.avatarIndex'),
          isKids: profileCreate.isKids === true,
          createdAt: now()
        });
        const verificationCreate = record(record(data.verificationTokens, 'verificationTokens').create, 'verificationTokens.create');
        state.db.verificationTokens.push({
          id: state.nextId('verify'),
          userId: user.id,
          tokenHash: requiredString(verificationCreate.tokenHash, 'tokenHash'),
          expiresAt: verificationCreate.expiresAt instanceof Date ? verificationCreate.expiresAt : now(),
          usedAt: null,
          createdAt: now()
        });
        return userWithProfiles(user);
      }),
      update: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const data = getData(query);
        const user = state.db.users.find((item) => item.id === where.id);
        if (!user) throw new Error('User not found');
        if (data.role === 'USER' || data.role === 'ADMIN') user.role = data.role;
        if (typeof data.isVerified === 'boolean') user.isVerified = data.isVerified;
        if (typeof data.passwordHash === 'string') user.passwordHash = data.passwordHash;
        user.updatedAt = now();
        return { ...user };
      }),
      count: vi.fn(async () => state.db.users.length),
      findMany: vi.fn(async () => state.db.users.map((user) => ({ ...user }))),
      delete: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        state.db.users = state.db.users.filter((user) => user.id !== where.id);
        return {};
      })
    },
    session: {
      create: vi.fn(async (query: JsonObject) => {
        const data = getData(query);
        const session: SessionRecord = {
          id: state.nextId('session'),
          userId: requiredString(data.userId, 'userId'),
          token: requiredString(data.token, 'token'),
          userAgent: optionalString(data.userAgent),
          ipAddress: optionalString(data.ipAddress),
          expiresAt: data.expiresAt instanceof Date ? data.expiresAt : now(),
          createdAt: now()
        };
        state.db.sessions.push(session);
        return session;
      }),
      findUnique: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const session = state.db.sessions.find((item) => item.token === where.token);
        if (!session) return null;
        const user = state.db.users.find((item) => item.id === session.userId);
        return user ? { ...session, user: userWithProfiles(user) } : null;
      }),
      delete: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        state.db.sessions = state.db.sessions.filter((session) => session.id !== where.id);
        return {};
      }),
      findMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.sessions.filter((session) => !where.userId || session.userId === where.userId).map((session) => ({ ...session }));
      }),
      findFirst: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.sessions.find((session) => session.id === where.id && session.userId === where.userId) ?? null;
      }),
      deleteMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const before = state.db.sessions.length;
        const tokenNot = where.token && typeof where.token === 'object' && !Array.isArray(where.token) ? (where.token as JsonObject).not : undefined;
        state.db.sessions = state.db.sessions.filter((session) => {
          if (typeof where.token === 'string' && session.token === where.token) return false;
          if (where.userId && session.userId === where.userId) {
            if (typeof tokenNot === 'string') return session.token === tokenNot;
            return false;
          }
          return true;
        });
        return { count: before - state.db.sessions.length };
      }),
      count: vi.fn(async () => state.db.sessions.length)
    },
    emailVerificationToken: {
      findUnique: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.verificationTokens.find((token) => token.tokenHash === where.tokenHash) ?? null;
      }),
      create: vi.fn(async (query: JsonObject) => {
        const data = getData(query);
        const token: EmailVerificationTokenRecord = {
          id: state.nextId('verify'),
          userId: requiredString(data.userId, 'userId'),
          tokenHash: requiredString(data.tokenHash, 'tokenHash'),
          expiresAt: data.expiresAt instanceof Date ? data.expiresAt : now(),
          usedAt: null,
          createdAt: now()
        };
        state.db.verificationTokens.push(token);
        return token;
      }),
      update: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const data = getData(query);
        const token = state.db.verificationTokens.find((item) => item.id === where.id);
        if (!token) throw new Error('Token not found');
        token.usedAt = data.usedAt instanceof Date ? data.usedAt : now();
        return token;
      })
    },
    passwordResetToken: {
      findUnique: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.passwordResetTokens.find((token) => token.tokenHash === where.tokenHash) ?? null;
      }),
      create: vi.fn(async (query: JsonObject) => {
        const data = getData(query);
        const token: EmailVerificationTokenRecord = {
          id: state.nextId('reset'),
          userId: requiredString(data.userId, 'userId'),
          tokenHash: requiredString(data.tokenHash, 'tokenHash'),
          expiresAt: data.expiresAt instanceof Date ? data.expiresAt : now(),
          usedAt: null,
          createdAt: now()
        };
        state.db.passwordResetTokens.push(token);
        return token;
      }),
      update: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const data = getData(query);
        const token = state.db.passwordResetTokens.find((item) => item.id === where.id);
        if (!token) throw new Error('Token not found');
        token.usedAt = data.usedAt instanceof Date ? data.usedAt : now();
        return token;
      })
    },
    profile: {
      findMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.profiles.filter((profile) => profile.userId === where.userId);
      }),
      count: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.profiles.filter((profile) => profile.userId === where.userId).length;
      }),
      create: vi.fn(async (query: JsonObject) => {
        const data = getData(query);
        const profile: ProfileRecord = {
          id: state.nextId('profile'),
          userId: requiredString(data.userId, 'profile.userId'),
          name: requiredString(data.name, 'profile.name'),
          avatarIndex: requiredNumber(data.avatarIndex ?? 0, 'profile.avatarIndex'),
          isKids: data.isKids === true,
          createdAt: now()
        };
        state.db.profiles.push(profile);
        return profile;
      }),
      findFirst: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.profiles.find((profile) => profile.id === where.id && profile.userId === where.userId) ?? null;
      }),
      update: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const data = getData(query);
        const profile = state.db.profiles.find((item) => item.id === where.id);
        if (!profile) throw new Error('Profile not found');
        if (typeof data.name === 'string') profile.name = data.name;
        if (typeof data.avatarIndex === 'number') profile.avatarIndex = data.avatarIndex;
        if (typeof data.isKids === 'boolean') profile.isKids = data.isKids;
        return profile;
      }),
      delete: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        state.db.profiles = state.db.profiles.filter((profile) => profile.id !== where.id);
        return {};
      })
    },
    genre: {
      findMany: vi.fn(async () => state.db.genres.map((genre) => ({ ...genre }))),
      create: vi.fn(async (query: JsonObject) => {
        const data = getData(query);
        const genre = { id: state.nextId('genre'), name: requiredString(data.name, 'genre.name'), slug: requiredString(data.slug, 'genre.slug') };
        state.db.genres.push(genre);
        return genre;
      })
    },
    content: {
      findMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        let rows = [...state.db.content];
        if (where.status) rows = rows.filter((content) => content.status === where.status);
        if (where.type) rows = rows.filter((content) => content.type === where.type);
        return rows.map(contentWithRelations);
      }),
      count: vi.fn(async () => state.db.content.length),
      create: vi.fn(async (query: JsonObject) => {
        const data = getData(query);
        const genreConnect = arrayOfObjects(record(data.genres, 'genres').connect).map((item) => requiredString(item.id, 'genre.id'));
        const content: ContentRecord = {
          id: state.nextId('content'),
          title: requiredString(data.title, 'content.title'),
          slug: requiredString(data.slug, 'content.slug'),
          description: requiredString(data.description, 'content.description'),
          type: data.type === 'SERIES' ? 'SERIES' : 'MOVIE',
          releaseYear: requiredNumber(data.releaseYear, 'content.releaseYear'),
          ageRating: requiredString(data.ageRating, 'content.ageRating'),
          durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : null,
          backdropUrl: requiredString(data.backdropUrl, 'content.backdropUrl'),
          posterUrl: requiredString(data.posterUrl, 'content.posterUrl'),
          logoUrl: optionalString(data.logoUrl),
          trailerUrl: optionalString(data.trailerUrl),
          isFeatured: optionalBoolean(data.isFeatured, false),
          isOriginal: optionalBoolean(data.isOriginal, false),
          isTrending: optionalBoolean(data.isTrending, false),
          isTopTen: optionalBoolean(data.isTopTen, false),
          topTenRank: typeof data.topTenRank === 'number' ? data.topTenRank : null,
          status: data.status === 'PUBLISHED' ? 'PUBLISHED' : data.status === 'ARCHIVED' ? 'ARCHIVED' : data.status === 'PROCESSING' ? 'PROCESSING' : 'DRAFT',
          maturityTags: Array.isArray(data.maturityTags) ? data.maturityTags.filter((item): item is string => typeof item === 'string') : [],
          createdAt: now(),
          updatedAt: now(),
          genreIds: genreConnect
        };
        state.db.content.push(content);
        const castCreate = arrayOfObjects(record(data.cast, 'cast').create);
        for (const member of castCreate) {
          state.db.cast.push({
            id: state.nextId('cast'),
            contentId: content.id,
            name: requiredString(member.name, 'cast.name'),
            role: requiredString(member.role, 'cast.role'),
            characterName: optionalString(member.characterName)
          });
        }
        return contentWithRelations(content);
      }),
      update: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const data = getData(query);
        const content = state.db.content.find((item) => item.id === where.id);
        if (!content) throw new Error('Content not found');
        if (typeof data.title === 'string') content.title = data.title;
        if (typeof data.slug === 'string') content.slug = data.slug;
        if (typeof data.description === 'string') content.description = data.description;
        if (data.type === 'MOVIE' || data.type === 'SERIES') content.type = data.type;
        if (typeof data.releaseYear === 'number') content.releaseYear = data.releaseYear;
        if (typeof data.ageRating === 'string') content.ageRating = data.ageRating;
        if (typeof data.durationMinutes === 'number' || data.durationMinutes === null) content.durationMinutes = data.durationMinutes;
        if (typeof data.backdropUrl === 'string') content.backdropUrl = data.backdropUrl;
        if (typeof data.posterUrl === 'string') content.posterUrl = data.posterUrl;
        if (typeof data.logoUrl === 'string' || data.logoUrl === null) content.logoUrl = data.logoUrl;
        if (typeof data.trailerUrl === 'string' || data.trailerUrl === null) content.trailerUrl = data.trailerUrl;
        if (typeof data.isFeatured === 'boolean') content.isFeatured = data.isFeatured;
        if (typeof data.isOriginal === 'boolean') content.isOriginal = data.isOriginal;
        if (typeof data.isTrending === 'boolean') content.isTrending = data.isTrending;
        if (typeof data.isTopTen === 'boolean') content.isTopTen = data.isTopTen;
        if (typeof data.topTenRank === 'number' || data.topTenRank === null) content.topTenRank = data.topTenRank;
        if (data.status === 'DRAFT' || data.status === 'PROCESSING' || data.status === 'PUBLISHED' || data.status === 'ARCHIVED') content.status = data.status;
        if (Array.isArray(data.maturityTags)) content.maturityTags = data.maturityTags.filter((item): item is string => typeof item === 'string');
        if (data.genres && typeof data.genres === 'object' && !Array.isArray(data.genres)) {
          content.genreIds = arrayOfObjects((data.genres as JsonObject).set).map((item) => requiredString(item.id, 'genre.id'));
        }
        content.updatedAt = now();
        return contentWithRelations(content);
      }),
      delete: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        state.db.content = state.db.content.filter((content) => content.id !== where.id);
        return {};
      }),
      findUnique: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const content = state.db.content.find((item) => item.id === where.id || item.slug === where.slug);
        return content ? contentWithRelations(content) : null;
      })
    },
    castMember: {
      deleteMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        state.db.cast = state.db.cast.filter((member) => member.contentId !== where.contentId);
        return {};
      }),
      createMany: vi.fn(async (query: JsonObject) => {
        for (const member of arrayOfObjects(query.data)) {
          state.db.cast.push({
            id: state.nextId('cast'),
            contentId: requiredString(member.contentId, 'cast.contentId'),
            name: requiredString(member.name, 'cast.name'),
            role: requiredString(member.role, 'cast.role'),
            characterName: optionalString(member.characterName)
          });
        }
        return {};
      })
    },
    video: {
      findMany: vi.fn(async () => [])
    },
    watchlist: {
      findMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.watchlist
          .filter((item) => item.profileId === where.profileId)
          .map((item) => {
            const content = state.db.content.find((row) => row.id === item.contentId);
            return { ...item, content: content ? contentWithRelations(content) : undefined };
          })
          .filter((item) => item.content);
      }),
      upsert: vi.fn(async (query: JsonObject) => {
        const where = record(getWhere(query).profileId_contentId, 'profileId_contentId');
        const profileId = requiredString(where.profileId, 'watchlist.profileId');
        const contentId = requiredString(where.contentId, 'watchlist.contentId');
        const exists = state.db.watchlist.some((item) => item.profileId === profileId && item.contentId === contentId);
        if (!exists) state.db.watchlist.push({ profileId, contentId, addedAt: now() });
        return {};
      }),
      deleteMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const before = state.db.watchlist.length;
        state.db.watchlist = state.db.watchlist.filter((item) => item.profileId !== where.profileId || item.contentId !== where.contentId);
        return { count: before - state.db.watchlist.length };
      })
    },
    uploadJob: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => [])
    },
    season: {
      upsert: vi.fn(async () => ({ id: state.nextId('season'), contentId: '', number: 1, title: 'Season 1' })),
      findUnique: vi.fn(async () => null)
    },
    episode: {
      create: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null)
    },
    download: {
      findMany: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const rows = state.db.downloads.filter((download) => matchDownloadWhere(download, where));
        const skip = typeof query.skip === 'number' ? query.skip : 0;
        const take = typeof query.take === 'number' ? query.take : rows.length;
        return rows.slice(skip, skip + take).map((download) => ({ ...download }));
      }),
      count: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        return state.db.downloads.filter((download) => matchDownloadWhere(download, where)).length;
      }),
      findUnique: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const composite = where.category_slug;
        if (composite && typeof composite === 'object' && !Array.isArray(composite)) {
          const key = composite as JsonObject;
          return state.db.downloads.find((download) => download.category === key.category && download.slug === key.slug) ?? null;
        }
        return state.db.downloads.find((download) => download.id === where.id) ?? null;
      }),
      update: vi.fn(async (query: JsonObject) => {
        const where = getWhere(query);
        const data = getData(query);
        const download = state.db.downloads.find((item) => item.id === where.id);
        if (!download) throw new Error('Download not found');
        const count = data.downloadCount;
        if (count && typeof count === 'object' && !Array.isArray(count) && typeof (count as JsonObject).increment === 'number') {
          download.downloadCount += (count as JsonObject).increment as number;
        }
        return { ...download };
      })
    },
    $transaction: vi.fn(async (items: Array<Promise<unknown>>) => Promise.all(items)),
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }])
  };
  return { prisma };
});

let createApp: typeof import('../src/app.js').createApp;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
});

beforeEach(() => {
  state.reset();
});

describe('cors origins', () => {
  it('allows loopback aliases and the current forwarded host', async () => {
    const app = createApp();

    await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://127.0.0.1:5173')
      .expect('access-control-allow-origin', 'http://127.0.0.1:5173')
      .expect(200);

    await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://media-box.local:47304')
      .set('Host', 'media-box.local:47304')
      .set('X-Forwarded-Proto', 'http')
      .expect('access-control-allow-origin', 'http://media-box.local:47304')
      .expect(200);
  });

  it('does not emit cors headers for unrelated origins', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://evil.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('auth flow', () => {
  it('registers, verifies, logs in, refreshes, and logs out', async () => {
    const app = createApp();
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'USER@Example.test', password: 'Password123!', displayName: 'Viewer' })
      .expect(201);

    expect(register.body.user.email).toBe('user@example.test');
    expect(register.body.accessToken).toEqual(expect.any(String));
    expect(register.body.devVerificationToken).toEqual(expect.any(String));
    expect(register.headers['set-cookie']).toBeDefined();

    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: register.body.devVerificationToken })
      .expect(200);

    const storedUser = state.db.users.find((user) => user.email === 'user@example.test');
    expect(storedUser?.isVerified).toBe(true);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.test', password: 'Password123!' })
      .expect(200);

    expect(login.body.profiles).toHaveLength(1);
    const loginCookie = login.headers['set-cookie'];
    expect(loginCookie).toBeDefined();

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', loginCookie)
      .expect(200);

    expect(refresh.body.accessToken).toEqual(expect.any(String));
    expect(state.db.sessions).toHaveLength(2);

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', refresh.headers['set-cookie'])
      .expect(204);

    expect(state.db.sessions).toHaveLength(1);
    expect(state.db.verificationTokens[0]?.tokenHash).toBe(sha256(register.body.devVerificationToken));
  });
});

describe('watchlist routes', () => {
  it('adds, lists, and removes content for the active profile', async () => {
    const app = createApp();
    const content = seedPublishedContent();
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'viewer@example.test', password: 'Password123!', displayName: 'Viewer' })
      .expect(201);

    const token = register.body.accessToken as string;
    const profileId = register.body.profiles[0].id as string;

    await request(app)
      .post('/api/v1/watchlist')
      .set('Authorization', `Bearer ${token}`)
      .set('x-profile-id', profileId)
      .send({ contentId: content.id })
      .expect(201);

    const list = await request(app)
      .get('/api/v1/watchlist')
      .set('Authorization', `Bearer ${token}`)
      .set('x-profile-id', profileId)
      .expect(200);

    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(content.id);

    await request(app)
      .delete(`/api/v1/watchlist/${content.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-profile-id', profileId)
      .expect(204);

    expect(state.db.watchlist).toHaveLength(0);
  });
});

describe('admin content CRUD', () => {
  it('creates, lists, updates, and deletes content as an admin', async () => {
    const app = createApp();
    const admin = await seedAdmin();
    const genre = seedGenre();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'AdminPass123!' })
      .expect(200);

    const token = login.body.accessToken as string;
    const create = await request(app)
      .post('/api/v1/admin/content')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Admin Movie',
        description: 'Created from an admin test.',
        type: 'MOVIE',
        releaseYear: 2026,
        ageRating: 'PG-13',
        durationMinutes: 112,
        backdropUrl: 'https://example.test/admin-backdrop.jpg',
        posterUrl: 'https://example.test/admin-poster.jpg',
        status: 'DRAFT',
        genreIds: [genre.id],
        maturityTags: ['Language'],
        cast: [{ name: 'A Director', role: 'Director' }]
      })
      .expect(201);

    expect(create.body.content.slug).toBe('admin-movie');
    const contentId = create.body.content.id as string;

    const list = await request(app)
      .get('/api/v1/admin/content')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body.items).toHaveLength(1);

    const patch = await request(app)
      .patch(`/api/v1/admin/content/${contentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PUBLISHED', isFeatured: true, cast: [{ name: 'Lead Actor', role: 'Actor', characterName: 'Lead' }] })
      .expect(200);

    expect(patch.body.content.isFeatured).toBe(true);
    expect(state.db.content[0]?.status).toBe('PUBLISHED');
    expect(state.db.cast).toHaveLength(1);

    await request(app)
      .delete(`/api/v1/admin/content/${contentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    expect(state.db.content).toHaveLength(0);
  });
});

describe('downloads storefront', () => {
  it('lists published items with pagination and a total', async () => {
    const app = createApp();
    seedDownload({ title: 'Visible App' });
    seedDownload({ title: 'Hidden App', isPublished: false });

    const response = await request(app)
      .get('/api/v1/downloads?category=SOFTWARE')
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].title).toBe('Visible App');
    expect(response.body.total).toBe(1);
    expect(response.body.page).toBe(1);
  });

  it('returns only featured items on the featured shelf', async () => {
    const app = createApp();
    seedDownload({ title: 'Plain App' });
    seedDownload({ title: 'Hero App', isFeatured: true });

    const response = await request(app)
      .get('/api/v1/downloads/featured?category=SOFTWARE')
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].title).toBe('Hero App');
    expect(response.body.items[0].isFeatured).toBe(true);
  });

  it('serves a single item by category and slug, hiding unpublished ones', async () => {
    const app = createApp();
    seedDownload({ title: 'Detail App', slug: 'detail-app' });
    seedDownload({ title: 'Secret App', slug: 'secret-app', isPublished: false });

    const ok = await request(app)
      .get('/api/v1/downloads/software/detail-app')
      .expect(200);
    expect(ok.body.item.slug).toBe('detail-app');

    await request(app)
      .get('/api/v1/downloads/software/secret-app')
      .expect(404);
  });
});

describe('password reset + sessions', () => {
  async function registerUser(app: ReturnType<typeof createApp>, email: string) {
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Member' })
      .expect(201);
    return { token: register.body.accessToken as string, cookie: register.headers['set-cookie'] as unknown as string };
  }

  it('resets a password via token and revokes existing sessions', async () => {
    const app = createApp();
    await registerUser(app, 'reset@example.test');

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'reset@example.test' })
      .expect(200);

    const resetToken = forgot.body.devResetToken as string;
    expect(resetToken).toEqual(expect.any(String));
    expect(state.db.sessions).toHaveLength(1);

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, password: 'BrandNew123!' })
      .expect(200);

    // Old sessions are gone; the new password works.
    expect(state.db.sessions).toHaveLength(0);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset@example.test', password: 'BrandNew123!' })
      .expect(200);
  });

  it('does not reveal whether an email exists', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.test' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.devResetToken).toBeUndefined();
  });

  it('changes password with the current one and keeps the current session', async () => {
    const app = createApp();
    const { token, cookie } = await registerUser(app, 'change@example.test');

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie)
      .send({ currentPassword: 'WrongPass1!', newPassword: 'Another123!' })
      .expect(400);

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie)
      .send({ currentPassword: 'Password123!', newPassword: 'Another123!' })
      .expect(200);

    // The device that changed the password stays signed in.
    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(sessions.body.sessions).toHaveLength(1);
    expect(sessions.body.sessions[0].current).toBe(true);
  });
});
