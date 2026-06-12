import type { Content, Genre, Profile, User } from '@prisma/client';

export function toUserDto(user: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'isVerified' | 'avatarUrl'>) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isVerified: user.isVerified,
    avatarUrl: user.avatarUrl
  };
}

export function toProfileDto(profile: Pick<Profile, 'id' | 'name' | 'avatarIndex' | 'isKids'>) {
  return { id: profile.id, name: profile.name, avatarIndex: profile.avatarIndex, isKids: profile.isKids };
}

export function toGenreDto(genre: Pick<Genre, 'id' | 'name' | 'slug'>) {
  return { id: genre.id, name: genre.name, slug: genre.slug };
}

type ContentWithGenres = Content & { genres: Genre[] };

export function toContentCardDto(content: ContentWithGenres) {
  return {
    id: content.id,
    title: content.title,
    slug: content.slug,
    description: content.description,
    type: content.type,
    releaseYear: content.releaseYear,
    ageRating: content.ageRating,
    durationMinutes: content.durationMinutes,
    backdropUrl: content.backdropUrl,
    posterUrl: content.posterUrl,
    logoUrl: content.logoUrl,
    trailerUrl: content.trailerUrl,
    isFeatured: content.isFeatured,
    isOriginal: content.isOriginal,
    isTrending: content.isTrending,
    isTopTen: content.isTopTen,
    topTenRank: content.topTenRank,
    genres: content.genres.map(toGenreDto)
  };
}
