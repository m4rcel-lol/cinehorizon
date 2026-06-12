export function toUserDto(user) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isVerified: user.isVerified,
        avatarUrl: user.avatarUrl
    };
}
export function toProfileDto(profile) {
    return { id: profile.id, name: profile.name, avatarIndex: profile.avatarIndex, isKids: profile.isKids };
}
export function toGenreDto(genre) {
    return { id: genre.id, name: genre.name, slug: genre.slug };
}
export function toContentCardDto(content) {
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
//# sourceMappingURL=mappers.js.map