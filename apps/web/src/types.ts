export type Role = 'USER' | 'ADMIN';
export type ContentType = 'MOVIE' | 'SERIES';
export interface User { id: string; email: string; displayName: string; role: Role; isVerified: boolean; avatarUrl?: string | null }
export interface Profile { id: string; name: string; avatarIndex: number; isKids: boolean }
export interface AuthResponse { user: User; profiles: Profile[]; accessToken: string }
export interface Session { id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; expiresAt: string; current: boolean }
export interface Genre { id: string; name: string; slug: string }
export interface ContentCard { id: string; title: string; slug: string; description: string; type: ContentType; releaseYear: number; ageRating: string; durationMinutes?: number | null; backdropUrl: string; posterUrl: string; logoUrl?: string | null; trailerUrl?: string | null; isFeatured: boolean; isOriginal: boolean; isTrending: boolean; isTopTen: boolean; topTenRank?: number | null; genres: Genre[]; progressSeconds?: number }
export interface ContentDetail extends ContentCard { cast: Array<{ id: string; name: string; role: string; characterName?: string | null }>; seasons: Array<{ id: string; number: number; title?: string | null; episodes: Array<{ id: string; number: number; title: string; description: string; durationMinutes: number; thumbnailUrl: string }> }>; maturityTags: string[] }
export interface Playback { contentId: string; title: string; episodeTitle?: string | null; streamUrl: string; mimeType: string; progressSeconds: number }
export type Platform = 'WINDOWS' | 'MAC' | 'LINUX' | 'ANDROID' | 'IOS' | 'WEB' | 'MULTI';
export type DownloadCategory = 'GAME' | 'SOFTWARE';
export interface DownloadItem { id: string; category: DownloadCategory; title: string; slug: string; description: string; platform: Platform; version?: string | null; developer?: string | null; genre?: string | null; coverImageUrl: string; fileName: string; fileSize: number; downloadCount: number; isPublished: boolean; isFeatured: boolean; isTrending: boolean; isTopRanked: boolean; rank?: number | null; createdAt: string }
