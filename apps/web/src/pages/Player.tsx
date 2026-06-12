import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, contentApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';

export default function Player() {
  const { slug = '', episodeId } = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(true);
  const profile = useAuthStore((s) => s.profile);
  const playback = useQuery({ queryKey: ['playback', slug, episodeId], queryFn: () => contentApi.playback(slug, episodeId), enabled: Boolean(slug && profile) });

  useEffect(() => {
    const video = videoRef.current;
    const data = playback.data;
    if (!video || !data) return;
    let hls: Hls | null = null;
    if (Hls.isSupported() && data.streamUrl.includes('.m3u8')) {
      hls = new Hls();
      hls.loadSource(data.streamUrl);
      hls.attachMedia(video);
    } else {
      video.src = data.streamUrl;
    }
    video.currentTime = data.progressSeconds;
    return () => { hls?.destroy(); };
  }, [playback.data]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback.data) return;
    const send = () => {
      void api('/history/progress', { method: 'POST', profile: true, body: JSON.stringify({ contentId: playback.data!.contentId, episodeId, progressSeconds: Math.floor(video.currentTime) }) }).catch(() => undefined);
    };
    const interval = window.setInterval(send, 10_000);
    video.addEventListener('pause', send);
    window.addEventListener('beforeunload', send);
    return () => { window.clearInterval(interval); video.removeEventListener('pause', send); window.removeEventListener('beforeunload', send); };
  }, [playback.data, slug, episodeId]);

  if (!profile) return <main className="player-page"><Link to="/profiles">Choose a profile first</Link></main>;
  return <main className="player-page"><Link to={`/title/${slug}`} className="player-back">‹ Back</Link><div className="player-title">{playback.data?.title}</div>{playback.isError ? <p>Could not load stream.</p> : <video ref={videoRef} controls autoPlay playsInline onPlay={() => setPaused(false)} onPause={() => setPaused(true)} />}{paused ? <button className="pause-overlay" onClick={() => void videoRef.current?.play()}>▶</button> : null}</main>;
}

