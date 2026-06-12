import bcrypt from 'bcryptjs';
export function hashPassword(password) {
    return bcrypt.hash(password, 12);
}
export function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
//# sourceMappingURL=passwords.js.map