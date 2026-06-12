import { ZodError } from 'zod';
export class AppError extends Error {
    statusCode;
    code;
    constructor(statusCode, code, message) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}
export const notFound = (_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};
export function errorHandler(error, _req, res, _next) {
    if (error instanceof ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400 });
    }
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code, statusCode: error.statusCode });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR', statusCode: 500 });
}
//# sourceMappingURL=errors.js.map