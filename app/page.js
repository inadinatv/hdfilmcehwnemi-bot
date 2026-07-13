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
      <h1 style={{ color: '#E50914', fontSize: '32px', fontWeight: 'bold', marginBottom: '5px' }}>
        NETFLIX <span style={{ color: 'white', fontSize: '14px', fontWeight: 'normal' }}>TMDB Arşivi</span>
      </h1>
      <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '25px' }}>Yüksek kaliteli afişler ve detaylı film bilgileri</p>

      {errorMessage && <p style={{color: 'red'}}>{errorMessage}</p>}

      {/* Film Detay ve Bilgi Modalı */}
      {selectedMovie && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px' }}>
          <div style={{ backgroundColor: '#1f1f1f', maxWidth: '600px', width: '100%', borderRadius: '12px', padding: '25px', position: 'relative', border: '1px solid #333' }}>
            <button onClick={() => setSelectedMovie(null)} style={{ position: 'absolute', top: '15px', right: '15px', backgroundColor: '#E50914', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>Kapat</button>
            
            <div style={{ display: 'flex', gap: '20px', flexDirection: window.innerWidth < 500 ? 'column' : 'row' }}>
              <img src={selectedMovie.poster} alt={selectedMovie.title} style={{ width: '150px', height: '225px', objectFit: 'cover', borderRadius: '8px', margin: '0 auto' }} />
              <div>
                <h2>{selectedMovie.title} <span style={{ fontSize: '14px', color: '#aaa' }}>({selectedMovie.year})</span></h2>
                <p style={{ color: '#46d369', fontWeight: 'bold', margin: '10px 0' }}>★ Puan: {selectedMovie.rating} / 10</p>
                <p style={{ fontSize: '13px', lineHeight: '1.5', color: '#ddd' }}>{selectedMovie.overview}</p>
              </div>
            </div>
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
