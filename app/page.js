'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeServer, setActiveServer] = useState(0);

  // Dünyanın en stabil ücretsiz TMDB oynatıcı kaynakları
  const servers = [
    { name: "Sunucu 1 (EmbedSU)", url: (id) => `https://embed.su/embed/movie/${id}` },
    { name: "Sunucu 2 (VidSrc NET)", url: (id) => `https://vidsrc.net/embed/movie?tmdb=${id}` },
    { name: "Sunucu 3 (VidSrc XYZ)", url: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}` }
  ];

  useEffect(() => {
    axios.get('/movies.json')
      .then(res => {
        setMovies(res.data.movies || []);
      })
      .catch(err => {
        setErrorMessage("Filmler henüz yüklenmedi. Lütfen Python botunu çalıştırın.");
      });
  }, []);

  // Film kapatıldığında sunucuyu sıfırla
  const handleClose = () => {
    setSelectedMovie(null);
    setActiveServer(0);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#141414', color: 'white', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#E50914', fontSize: '32px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
        NETFLIX <span style={{ color: 'white', fontSize: '14px', fontWeight: 'normal' }}>Tarzı Bot</span>
      </h1>
      <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '25px' }}>Çoklu Sunucu • Kesintisiz Akış</p>

      {errorMessage && <p style={{color: 'red'}}>{errorMessage}</p>}

      {/* Film Oynatıcı Modalı */}
      {selectedMovie && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#000', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
          
          {/* Üst Bar ve Sunucu Seçimi */}
          <div style={{ padding: '15px', backgroundColor: '#141414', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'white' }}>{selectedMovie.title}</h2>
              <button onClick={handleClose} style={{ backgroundColor: '#E50914', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Kapat</button>
            </div>
            
            {/* Sunucu Butonları */}
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px' }}>
              {servers.map((server, index) => (
                <button 
                  key={index} 
                  onClick={() => setActiveServer(index)}
                  style={{ 
                    backgroundColor: activeServer === index ? '#E50914' : '#333', 
                    color: 'white', border: 'none', padding: '8px 12px', 
                    borderRadius: '5px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' 
                  }}
                >
                  {server.name}
                </button>
              ))}
            </div>
          </div>
          
          {/* Oynatıcı Iframe */}
          <div style={{ flex: 1, width: '100%', backgroundColor: '#000' }}>
            <iframe 
              src={servers[activeServer].url(selectedMovie.id)} 
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
