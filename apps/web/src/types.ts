export type Role = 'USER' | 'ADMIN';
export type ContentType = 'MOVIE' | 'SERIES';
export interface User { id: string; email: string; displayName: string; role: Role; isVerified: boolean; avatarUrl?: string | null }
export interface Profile { id: string; name: string; avatarIndex: number; isKids: boolean }
export interface Genre { id: string; name: string; slug: string }
export interface ContentCard { id: string; title: string; slug: string; description: string; type: ContentType; releaseYear: number; ageRating: string; durationMinutes?: number | null; backdropUrl: string; posterUrl: string; logoUrl?: string | null; trailerUrl?: string | null; isFeatured: boolean; isOriginal: boolean; isTrending: boolean; isTopTen: boolean; topTenRank?: number | null; genres: Genre[]; progressSeconds?: number }
export interface ContentDetail extends ContentCard { cast: Array<{ id: string; name: string; role: string; characterName?: string | null }>; seasons: Array<{ id: string; number: number; title?: string | null; episodes: Array<{ id: string; number: number; title: string; description: string; durationMinutes: number; thumbnailUrl: string }> }>; maturityTags: string[] }
export interface Playback { contentId: string; title: string; episodeTitle?: string | null; streamUrl: string; mimeType: string; progressSeconds: number }
