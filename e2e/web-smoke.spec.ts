import { expect, test } from '@playwright/test';

const content = {
  id: 'content_1',
  title: 'Red Horizon',
  slug: 'red-horizon',
  description: 'A featured film on CineHorizon.',
  type: 'MOVIE',
  releaseYear: 2026,
  ageRating: 'PG-13',
  durationMinutes: 112,
  backdropUrl: 'https://picsum.photos/seed/e2e-backdrop/1280/720',
  posterUrl: 'https://picsum.photos/seed/e2e-poster/342/513',
  logoUrl: null,
  trailerUrl: null,
  isFeatured: true,
  isOriginal: true,
  isTrending: true,
  isTopTen: true,
  topTenRank: 1,
  genres: [{ id: 'genre_1', name: 'Drama', slug: 'drama' }],
  cast: [{ id: 'cast_1', name: 'Avery Stone', role: 'Director', characterName: null }],
  seasons: [],
  maturityTags: ['Language']
};

test('loads home, opens a title, and mounts the player', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/v1/auth/refresh') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user_1', email: 'viewer@example.test', displayName: 'Viewer', role: 'USER', isVerified: true, avatarUrl: null },
          profiles: [{ id: 'profile_1', name: 'Viewer', avatarIndex: 0, isKids: false }],
          accessToken: 'e2e-token'
        })
      });
      return;
    }

    if (path === '/api/v1/content/featured' || path === '/api/v1/content/trending' || path === '/api/v1/content/top-ten' || path === '/api/v1/content/new-arrivals') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [content] }) });
      return;
    }

    if (path === '/api/v1/content/genres') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ genres: content.genres }) });
      return;
    }

    if (path === '/api/v1/content') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [content], total: 1, page: 1, limit: 20 }) });
      return;
    }

    if (path === '/api/v1/content/red-horizon') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content }) });
      return;
    }

    if (path === '/api/v1/content/red-horizon/playback') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          contentId: content.id,
          title: content.title,
          episodeTitle: null,
          streamUrl: 'https://cdn.example.test/red-horizon.mp4',
          mimeType: 'video/mp4',
          progressSeconds: 0
        })
      });
      return;
    }

    if (path === '/api/v1/history/progress') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not mocked', code: 'NOT_MOCKED', statusCode: 404 }) });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Red Horizon' })).toBeVisible();

  await page.getByRole('link', { name: 'Red Horizon' }).first().click();
  await expect(page).toHaveURL(/\/title\/red-horizon$/);
  await expect(page.getByRole('heading', { name: 'Red Horizon' })).toBeVisible();

  await page.getByRole('link', { name: /Play/ }).click();
  await expect(page).toHaveURL(/\/watch\/red-horizon$/);
  await expect(page.locator('video')).toBeVisible();
});
