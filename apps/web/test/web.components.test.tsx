import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hero } from '../src/components/Hero';
import Player from '../src/pages/Player';
import Profiles from '../src/pages/Profiles';
import { useAuthStore } from '../src/stores/auth';
import type { ContentCard, Profile, User } from '../src/types';

const mocks = vi.hoisted(() => {
  const playback = {
    contentId: 'content_1',
    title: 'Seed Movie',
    streamUrl: 'https://cdn.example.test/seed.m3u8',
    mimeType: 'application/vnd.apple.mpegurl',
    progressSeconds: 45
  };
  return {
    apiMock: vi.fn(async () => ({ ok: true })),
    playbackMock: vi.fn(async () => playback)
  };
});

vi.mock('../src/lib/api', () => ({
  api: mocks.apiMock,
  contentApi: {
    playback: mocks.playbackMock
  }
}));

vi.mock('hls.js', () => ({
  default: class HlsMock {
    static isSupported() {
      return false;
    }

    loadSource() {}
    attachMedia() {}
    destroy() {}
  }
}));

const user: User = {
  id: 'user_1',
  email: 'viewer@example.test',
  displayName: 'Viewer',
  role: 'USER',
  isVerified: true,
  avatarUrl: null
};

const profiles: Profile[] = [
  { id: 'profile_1', name: 'Viewer', avatarIndex: 0, isKids: false },
  { id: 'profile_2', name: 'Kids', avatarIndex: 1, isKids: true }
];

const content: ContentCard = {
  id: 'content_1',
  title: 'Red Horizon',
  slug: 'red-horizon',
  description: 'A featured film on CineHorizon.',
  type: 'MOVIE',
  releaseYear: 2026,
  ageRating: 'PG-13',
  durationMinutes: 112,
  backdropUrl: 'https://example.test/backdrop.jpg',
  posterUrl: 'https://example.test/poster.jpg',
  logoUrl: null,
  trailerUrl: null,
  isFeatured: true,
  isOriginal: true,
  isTrending: true,
  isTopTen: false,
  topTenRank: null,
  genres: [{ id: 'genre_1', name: 'Drama', slug: 'drama' }]
};

function renderWithProviders(ui: React.ReactElement, initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.apiMock.mockClear();
  mocks.playbackMock.mockClear();
  useAuthStore.setState({ user: null, profiles: [], profile: null, accessToken: null });
});

describe('ProfileSelect', () => {
  it('renders available profiles and add-profile tile', () => {
    useAuthStore.setState({ user, profiles, profile: null, accessToken: 'token' });

    renderWithProviders(
      <Routes>
        <Route path="/" element={<Profiles />} />
        <Route path="/browse" element={<div>Browse</div>} />
      </Routes>
    );

    expect(screen.getByRole('heading', { name: "Who's watching?" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Viewer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kids/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Profile/ })).toBeInTheDocument();
  });
});

describe('Hero', () => {
  it('renders featured content metadata and primary actions', () => {
    renderWithProviders(<Hero item={content} />);

    expect(screen.getByRole('heading', { name: 'Red Horizon' })).toBeInTheDocument();
    expect(screen.getByText('PG-13')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Play/ })).toHaveAttribute('href', '/watch/red-horizon');
    expect(screen.getByRole('link', { name: /More Info/ })).toHaveAttribute('href', '/title/red-horizon');
  });
});

describe('Player', () => {
  it('mounts the video element and toggles the pause overlay from media events', async () => {
    useAuthStore.setState({ user, profiles, profile: profiles[0]!, accessToken: 'token' });

    renderWithProviders(
      <Routes>
        <Route path="/watch/:slug" element={<Player />} />
      </Routes>,
      '/watch/seed-movie'
    );

    const video = await screen.findByRole('button', { name: '▶' });
    expect(video).toBeInTheDocument();
    const media = document.querySelector('video');
    expect(media).toBeInTheDocument();

    fireEvent.play(media!);
    await waitFor(() => expect(screen.queryByRole('button', { name: '▶' })).not.toBeInTheDocument());

    fireEvent.pause(media!);
    expect(await screen.findByRole('button', { name: '▶' })).toBeInTheDocument();
    expect(mocks.playbackMock).toHaveBeenCalledWith('seed-movie', undefined);
  });
});
