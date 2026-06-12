import { AppError } from './errors.js';
export function parseBody(req, schema) {
    return schema.parse(req.body);
}
export function parseQuery(req, schema) {
    return schema.parse(req.query);
}
export function requireParam(req, name) {
    const value = req.params[name];
    if (!value)
        throw new AppError(400, 'MISSING_ROUTE_PARAM', `Missing route parameter: ${name}`);
    return value;
}
export function requireIntParam(req, name) {
    const raw = requireParam(req, name);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1)
        throw new AppError(400, 'BAD_ROUTE_PARAM', `Route parameter must be a positive integer: ${name}`);
    return value;
}
export function requireActiveProfileId(req) {
    if (!req.activeProfileId)
        throw new AppError(400, 'PROFILE_REQUIRED', 'x-profile-id header is required');
    return req.activeProfileId;
}
//# sourceMappingURL=validate.js.map