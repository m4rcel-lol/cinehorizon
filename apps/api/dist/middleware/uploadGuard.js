import { AppError } from '../lib/errors.js';
const imageSignatures = [
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
    { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { mime: 'image/webp', asciiAt8: 'WEBP' }
];
const videoSignatures = [
    { mime: 'video/mp4', asciiAt4: 'ftyp' },
    { mime: 'video/quicktime', asciiAt4: 'ftyp' },
    { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] }
];
function startsWith(buffer, bytes) {
    return bytes.every((byte, index) => buffer[index] === byte);
}
export function assertMagicBytes(buffer, mimeType, category) {
    const signatures = category === 'image' ? imageSignatures : videoSignatures;
    const ok = signatures.some((signature) => {
        if ('bytes' in signature && signature.bytes)
            return startsWith(buffer, signature.bytes);
        if ('asciiAt4' in signature && signature.asciiAt4)
            return buffer.subarray(4, 8).toString('ascii') === signature.asciiAt4;
        if ('asciiAt8' in signature && signature.asciiAt8)
            return buffer.subarray(8, 12).toString('ascii') === signature.asciiAt8;
        return false;
    });
    if (!ok)
        throw new AppError(400, 'BAD_FILE_SIGNATURE', `Uploaded ${category} has invalid magic bytes for ${mimeType}`);
}
//# sourceMappingURL=uploadGuard.js.map