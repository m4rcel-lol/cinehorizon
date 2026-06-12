import crypto from 'node:crypto';
export function randomToken(bytes = 64) {
    return crypto.randomBytes(bytes).toString('base64url');
}
export function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
//# sourceMappingURL=crypto.js.map