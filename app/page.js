'use client';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import Hls from 'hls.js';

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    axios.get('/api/home').then(res => setMovies(res.data.movies || []));
  }, []);

  const playMovie = async (movieUrl) => {
    setLoading(true);
    setPlaying(true);
    try {
      const res = await axios.get(`/api/video?url=${movieUrl}`);
      const m3u8 = res.data.m3u8Url;

      if (Hls.isSupported() && videoRef.current) {
        const hls = new Hls();
        hls.loadSource(m3u8);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current.play());
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = m3u8;
        videoRef.current.play();
      }
    } catch (err) {
      alert("Video yüklenemedi. Cloudflare engeli veya şifreleme değişmiş olabilir.");
      setPlaying(false);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#E50914', fontSize: '30px', fontWeight: 'bold', marginBottom: '20px' }}>
        NETFLIX <span style={{ color: 'white', fontSize: '14px', fontWeight: 'normal' }}>Tarzı Bot</span>
      </h1>

      {playing && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <button onClick={() => setPlaying(null)} style={{ position: 'absolute', top: '20px', right: '20px', backgroundColor: '#E50914', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px' }}>Kapat</button>
          {loading ? <p style={{ fontSize: '20px' }}>Video Çözülüyor...</p> : null}
          <video ref={videoRef} controls style={{ width: '90%', maxWidth: '800px', borderRadius: '10px', backgroundColor: 'black' }} />
        </div>
      )}

      <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>Yeni Eklenenler</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '15px' }}>
        {movies.map((movie, idx) => (
          <div key={idx} onClick={() => playMovie(movie.href)} style={{ cursor: 'pointer', position: 'relative' }}>
            <img src={movie.poster} alt={movie.title} style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '8px' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', padding: '5px', background: 'rgba(0,0,0,0.7)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>
              <p style={{ fontSize: '12px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
