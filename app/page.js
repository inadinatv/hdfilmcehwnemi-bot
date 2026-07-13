'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    axios.get('/movies.json')
      .then(res => setMovies(res.data.movies || []))
      .catch(err => setErrorMessage("Filmler henüz yüklenmedi. Python botunu çalıştırın."));
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#141414', color: 'white', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#E50914', fontSize: '32px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
        HDFILM <span style={{ color: 'white', fontSize: '14px', fontWeight: 'normal' }}>Cehennemi</span>
      </h1>
      <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '25px' }}>Orijinal Oynatıcı Modu</p>

      {errorMessage && <p style={{color: 'red'}}>{errorMessage}</p>}

      {selectedMovie && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#000', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', backgroundColor: '#141414', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', margin: 0, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{selectedMovie.title}</h2>
            <button onClick={() => setSelectedMovie(null)} style={{ backgroundColor: '#E50914', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Kapat</button>
          </div>
          <div style={{ flex: 1, width: '100%', backgroundColor: '#000' }}>
            <iframe 
              src={selectedMovie.href} 
              style={{ width: '100%', height: '100%', border: 'none' }} 
              allowFullScreen 
              allow="autoplay; fullscreen; encrypted-media"
            ></iframe>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '15px' }}>
        {movies.map((movie, idx) => (
          <div key={idx} onClick={() => setSelectedMovie(movie)} style={{ cursor: 'pointer', backgroundColor: '#1f1f1f', borderRadius: '8px', overflow: 'hidden', transition: 'transform 0.2s' }}>
            <img src={movie.poster} alt={movie.title} style={{ width: '100%', height: '190px', objectFit: 'cover' }} />
            <div style={{ padding: '8px' }}>
              <p style={{ fontSize: '12px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold' }}>{movie.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
