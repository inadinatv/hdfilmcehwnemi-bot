'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    axios.get('/movies.json')
      .then(res => {
        setMovies(res.data.movies || []);
      })
      .catch(err => {
        setErrorMessage("Filmler henüz yüklenmedi. Lütfen Python botunu çalıştırın.");
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#141414', color: 'white', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#E50914', fontSize: '32px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
        NETFLIX <span style={{ color: 'white', fontSize: '14px', fontWeight: 'normal' }}>Tarzı Bot</span>
      </h1>
      <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '25px' }}>Sıfır Hata, Kesintisiz Akış</p>

      {errorMessage && <p style={{color: 'red'}}>{errorMessage}</p>}

      {/* Film Oynatıcı Modalı */}
      {selectedMovie && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 50, display: 'flex', flexDirection: 'column', padding: '10px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '10px' }}>
            <h2 style={{ fontSize: '18px', margin: 0, color: 'white' }}>{selectedMovie.title}</h2>
            <button onClick={() => setSelectedMovie(null)} style={{ backgroundColor: '#E50914', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Kapat</button>
          </div>
          
          {/* TMDB ID üzerinden çalışan Vidsrc Oynatıcısı */}
          <div style={{ flex: 1, width: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
            <iframe 
              src={`https://vidsrc.me/embed/movie?tmdb=${selectedMovie.id}`} 
              style={{ width: '100%', height: '100%', border: 'none' }} 
              allowFullScreen 
              allow="autoplay; fullscreen"
            ></iframe>
          </div>

        </div>
      )}

      {/* Film Grid Listesi */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '15px' }}>
        {movies.map((movie, idx) => (
          <div key={idx} onClick={() => setSelectedMovie(movie)} style={{ cursor: 'pointer', backgroundColor: '#1f1f1f', borderRadius: '8px', overflow: 'hidden', transition: 'transform 0.2s' }}>
            <img src={movie.poster} alt={movie.title} style={{ width: '100%', height: '190px', objectFit: 'cover' }} />
            <div style={{ padding: '8px' }}>
              <p style={{ fontSize: '12px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold' }}>{movie.title}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                <span style={{ fontSize: '10px', color: '#aaa' }}>{movie.year}</span>
                <span style={{ fontSize: '10px', color: '#46d369', fontWeight: 'bold' }}>★ {movie.rating}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
