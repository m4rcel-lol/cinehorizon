export type Role = 'USER' | 'ADMIN';
export type ContentType = 'MOVIE' | 'SERIES';
export type ContentStatus = 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED';
export type VideoStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type VideoQuality = 'SD_480' | 'HD_720' | 'FHD_1080' | 'UHD_4K';

export interface ApiErrorBody {
  error: string;
  code: string;
  statusCode: number;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isVerified: boolean;
  avatarUrl?: string | null;
}

export interface ProfileDto {
  id: string;
  name: string;
  avatarIndex: number;
  isKids: boolean;
}

export interface GenreDto {
  id: string;
  name: string;
  slug: string;
}

export interface ContentCardDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: ContentType;
  releaseYear: number;
  ageRating: string;
  durationMinutes?: number | null;
  backdropUrl: string;
  posterUrl: string;
  logoUrl?: string | null;
  trailerUrl?: string | null;
  isFeatured: boolean;
  isOriginal: boolean;
  isTrending: boolean;
  isTopTen: boolean;
  topTenRank?: number | null;
  genres: GenreDto[];
}

export interface EpisodeDto {
  id: string;
  number: number;
  title: string;
  description: string;
  durationMinutes: number;
  thumbnailUrl: string;
}

export interface SeasonDto {
  id: string;
  number: number;
  title?: string | null;
  episodes: EpisodeDto[];
}

export interface ContentDetailDto extends ContentCardDto {
  cast: Array<{ id: string; name: string; role: string; characterName?: string | null }>;
  seasons: SeasonDto[];
  maturityTags: string[];
}

export interface PlaybackDto {
  title: string;
  episodeTitle?: string | null;
  streamUrl: string;
  mimeType: string;
  progressSeconds: number;
}
