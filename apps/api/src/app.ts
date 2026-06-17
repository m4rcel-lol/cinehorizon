import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './config/env.js';
import { apiLimiter, verifyOrigin } from './middleware/security.js';
import { errorHandler, notFound } from './lib/errors.js';
import { isOriginAllowed } from './lib/origins.js';
import { authRouter } from './routes/auth.js';
import { profileRouter } from './routes/profiles.js';
import { contentRouter } from './routes/content.js';
import { watchlistRouter } from './routes/watchlist.js';
import { historyRouter } from './routes/history.js';
import { searchRouter } from './routes/search.js';
import { gamesRouter } from './routes/games.js';
import { adminRouter } from './routes/admin.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();
  const helmetOptions = {
    crossOriginResourcePolicy: { policy: 'cross-origin' as const },
    ...(isProduction ? {} : { contentSecurityPolicy: false as const })
  };

  app.set('trust proxy', 1);
  app.use(helmet(helmetOptions));
  app.use((req, res, next) => cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isOriginAllowed(origin, req));
    },
    credentials: true
  })(req, res, next));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(apiLimiter);
  app.use(verifyOrigin);
  app.use('/media', express.static(env.LOCAL_MEDIA_DIR, { maxAge: isProduction ? '1h' : 0 }));

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/profiles', profileRouter);
  app.use('/api/v1/content', contentRouter);
  app.use('/api/v1/watchlist', watchlistRouter);
  app.use('/api/v1/history', historyRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/games', gamesRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
