import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
export function requireAuth(req, _res, next) {
    const header = req.header('Authorization');
    if (!header?.startsWith('Bearer '))
        return next(new AppError(401, 'UNAUTHENTICATED', 'Missing bearer token'));
    const token = header.slice('Bearer '.length);
    try {
        const payload = verifyAccessToken(token);
        req.auth = { userId: payload.sub, email: payload.email, role: payload.role };
        const profileId = req.header('x-profile-id');
        if (profileId)
            req.activeProfileId = profileId;
        return next();
    }
    catch {
        return next(new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'));
    }
}
export async function requireActiveProfile(req, _res, next) {
    if (!req.auth)
        return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
    const profileId = req.activeProfileId;
    if (!profileId)
        return next(new AppError(400, 'PROFILE_REQUIRED', 'x-profile-id header is required'));
    const profile = await prisma.profile.findFirst({ where: { id: profileId, userId: req.auth.userId } });
    if (!profile)
        return next(new AppError(403, 'PROFILE_FORBIDDEN', 'Profile does not belong to this user'));
    return next();
}
export function requireAdmin(req, _res, next) {
    if (!req.auth)
        return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
    if (req.auth.role !== 'ADMIN')
        return next(new AppError(403, 'ADMIN_ONLY', 'Admin access required'));
    return next();
}
//# sourceMappingURL=auth.js.map