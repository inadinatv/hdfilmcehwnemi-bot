'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';

const PAGE_CHUNK = 36;
const GROUP_LABEL = {
  liste: '🎬 Özel Listeler',
  tür: '🎭 Film Türleri',
  yıl: '📅 Yıllar & Dönemler',
  imdb: '⭐ IMDb Puanları',
  dil: '🗣️ Dil & Dublaj',
  dizi: '📺 Dizi & Format',
};
const GROUP_ORDER = ['liste', 'tür', 'yıl', 'imdb', 'dil', 'dizi'];

export default function Home() {
  const [data, setData] = useState({ movies: [], categories: [], total: 0, updatedAt: null });
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [activeGroup, setActiveGroup] = useState('all'); // 'all' | 'liste' | 'tür' | 'yıl' | 'imdb' | 'dil' | 'dizi' | 'favs' | 'history'
  const [selectedCat, setSelectedCat] = useState('Tümü');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedLang, setSelectedLang] = useState('');
  const [minImdb, setMinImdb] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('default');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'compact' | 'list'
  const [limit, setLimit] = useState(PAGE_CHUNK);

  // Canlı arama & Yerel depolama
  const [remoteResults, setRemoteResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [favs, setFavs] = useState([]);
  const [history, setHistory] = useState([]);
  const [previewMovie, setPreviewMovie] = useState(null);
  const [showKeySettings, setShowKeySettings] = useState(false);
  const [userKey, setUserKey] = useState('');

  // Canlı liste çekimi
  const [live, setLive] = useState({ key: null, page: 1, movies: [], hasMore: false, loading: false });
  const sentinel = useRef(null);

  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => {
        setData({
          movies: d.movies || [],
          categories: d.categories || [],
          total: d.total || (d.movies || []).length,
          updatedAt: d.updatedAt,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    try {
      setFavs(JSON.parse(localStorage.getItem('favs') || '[]'));
      setHistory(JSON.parse(localStorage.getItem('history') || '[]'));
      setUserKey(localStorage.getItem('hdfc_user_key') || '');
    } catch { /* */ }
  }, []);

  /* Canlı arama - debounce */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRemoteResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`).then((x) => x.json());
        setRemoteResults(r.results || []);
      } catch {
        setRemoteResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const groups = useMemo(() => {
    const g = {};
    for (const c of data.categories) {
      (g[c.group || 'tür'] ||= []).push(c);
    }
    return GROUP_ORDER.filter((k) => g[k]?.length).map((k) => ({
      key: k,
      label: GROUP_LABEL[k],
      items: g[k],
    }));
  }, [data.categories]);

  // Filtreleme ve sıralama algoritması
  const filtered = useMemo(() => {
    let list = data.movies;

    // Özel sekmeler
    if (activeGroup === 'favs') {
      list = list.filter((m) => favs.includes(m.id));
    } else if (activeGroup === 'history') {
      list = history.map((h) => data.movies.find((m) => m.id === h.id) || h).filter(Boolean);
    } else if (selectedCat !== 'Tümü') {
      list = list.filter((m) => (m.categories || []).includes(selectedCat));
    }

    // Ekstra kombine filtreler
    if (selectedGenre) {
      list = list.filter((m) => (m.genres || []).includes(selectedGenre) || (m.categories || []).includes(selectedGenre));
    }
    if (selectedYear) {
      if (selectedYear.includes('-') || selectedYear.includes('Öncesi')) {
        list = list.filter((m) => (m.categories || []).includes(selectedYear));
      } else {
        list = list.filter((m) => String(m.year) === selectedYear);
      }
    }
    if (selectedLang) {
      list = list.filter((m) => (m.languages || []).includes(selectedLang) || (m.categories || []).includes(selectedLang));
    }
    if (selectedFormat) {
      list = list.filter((m) => m.type === selectedFormat || (m.categories || []).includes(selectedFormat));
    }
    if (minImdb > 0) {
      list = list.filter((m) => (m.imdb || 0) >= minImdb);
    }

    // Arama filtreleme
    const needle = q.trim().toLocaleLowerCase('tr');
    if (needle) {
      const local = list.filter((m) =>
        m.title.toLocaleLowerCase('tr').includes(needle) ||
        (m.originalTitle && m.originalTitle.toLocaleLowerCase('tr').includes(needle)) ||
        (m.cast && m.cast.some((c) => c.toLocaleLowerCase('tr').includes(needle))) ||
        (m.genres && m.genres.some((g) => g.toLocaleLowerCase('tr').includes(needle)))
      );
      const ids = new Set(local.map((m) => m.id));
      list = [...local, ...(remoteResults || []).filter((m) => !ids.has(m.id))];
    }

    // Sıralama
    if (sort === 'imdb') {
      list = [...list].sort((a, b) => (b.imdb || 0) - (a.imdb || 0));
    } else if (sort === 'year_desc') {
      list = [...list].sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sort === 'year_asc') {
      list = [...list].sort((a, b) => (a.year || 0) - (b.year || 0));
    } else if (sort === 'az') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    } else if (sort === 'za') {
      list = [...list].sort((a, b) => b.title.localeCompare(a.title, 'tr'));
    }

    return list;
  }, [
    data.movies,
    activeGroup,
    selectedCat,
    selectedGenre,
    selectedYear,
    selectedLang,
    selectedFormat,
    minImdb,
    q,
    sort,
    remoteResults,
    favs,
    history,
  ]);

  useEffect(() => {
    setLimit(PAGE_CHUNK);
  }, [activeGroup, selectedCat, selectedGenre, selectedYear, selectedLang, selectedFormat, minImdb, q, sort]);

  /* Sonsuz kaydırma */
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setLimit((l) => l + PAGE_CHUNK);
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Canlı liste yükleme */
  const loadLive = useCallback(async (key, page = 1) => {
    setLive((s) => ({ ...s, key, loading: true }));
    try {
      const r = await fetch(`/api/list?key=${key}&page=${page}`).then((x) => x.json());
      setLive((s) => ({
        key,
        page,
        loading: false,
        hasMore: !!r.hasMore,
        movies: page === 1 ? (r.movies || []) : [...s.movies, ...(r.movies || [])],
      }));
    } catch {
      setLive((s) => ({ ...s, loading: false }));
    }
  }, []);

  const toggleFav = (m, e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = favs.includes(m.id) ? favs.filter((x) => x !== m.id) : [...favs, m.id];
    setFavs(next);
    localStorage.setItem('favs', JSON.stringify(next));
  };

  const clearAllFilters = () => {
    setActiveGroup('all');
    setSelectedCat('Tümü');
    setSelectedGenre('');
    setSelectedYear('');
    setSelectedLang('');
    setSelectedFormat('');
    setMinImdb(0);
    setQ('');
    setSort('default');
  };

  const hasActiveFilters = selectedCat !== 'Tümü' || selectedGenre || selectedYear || selectedLang || selectedFormat || minImdb > 0 || q;
  const shown = filtered.slice(0, limit);
  const heroMovie = data.movies[0] || null;

  return (
    <main className="main-wrap">
      {/* Üst Başlık & Arama Barı */}
      <header className="site-hdr">
        <div className="hdr-left">
          <Link href="/" className="logo" onClick={clearAllFilters}>
            HDFILM<span>CEHENNEMİ</span>
          </Link>
          <span className="badge-bot">V2.0 PRO</span>
        </div>

        <div className="search-bar">
          <span className="search-ico">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Film, dizi, oyuncu veya tür ara… (Otomatik canlı arama)"
          />
          {searching && <span className="search-spin" />}
          {q && (
            <button className="clear-btn" onClick={() => setQ('')} title="Aramayı Temizle">
              ✕
            </button>
          )}
        </div>

        <div className="hdr-right">
          <button className="btn-settings" onClick={() => setShowKeySettings(true)}>
            🔑 API & Key Ayarları
          </button>
          <div className="stats-pill">
            <span>{data.total.toLocaleString('tr')} Film</span>
            <small>· {data.categories.length} Kategori</small>
          </div>
        </div>
      </header>

      {/* Öne Çıkan Film Banner'ı (Spotlight) */}
      {!hasActiveFilters && heroMovie && (
        <section className="hero-banner" style={{ backgroundImage: `linear-gradient(90deg, #0d0d0d 20%, rgba(13,13,13,0.7) 60%, transparent 100%), url(${heroMovie.backdrop || heroMovie.poster})` }}>
          <div className="hero-content">
            <span className="hero-tag">🔥 HAFTANIN POPÜLER FİLMİ</span>
            <h2 className="hero-title">{heroMovie.title}</h2>
            <div className="hero-meta">
              {heroMovie.imdb && <span className="imdb-pill">★ {heroMovie.imdb.toFixed(1)} IMDb</span>}
              {heroMovie.year && <span className="meta-pill">{heroMovie.year}</span>}
              {heroMovie.duration && <span className="meta-pill">{heroMovie.duration}</span>}
              {heroMovie.genres?.slice(0, 3).map((g) => (
                <span key={g} className="genre-pill">{g}</span>
              ))}
            </div>
            <p className="hero-desc">{heroMovie.description}</p>
            <div className="hero-actions">
              <Link
                href={`/watch/${encodeURIComponent(heroMovie.id)}?u=${encodeURIComponent(heroMovie.href)}`}
                className="btn-play-hero"
              >
                ▶ Hemen İzle
              </Link>
              <button className="btn-info-hero" onClick={() => setPreviewMovie(heroMovie)}>
                ℹ Detaylı Bilgi
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Ana Kategori Navigasyonu */}
      <nav className="cat-nav">
        <div className="nav-tabs">
          <button
            className={activeGroup === 'all' && selectedCat === 'Tümü' ? 'tab-btn on' : 'tab-btn'}
            onClick={() => {
              setActiveGroup('all');
              setSelectedCat('Tümü');
            }}
          >
            🏠 Tüm Katalog
          </button>
          <button
            className={activeGroup === 'favs' ? 'tab-btn on fav-tab' : 'tab-btn fav-tab'}
            onClick={() => {
              setActiveGroup('favs');
              setSelectedCat('Tümü');
            }}
          >
            ⭐ Favorilerim {favs.length > 0 && <span className="count">{favs.length}</span>}
          </button>
          <button
            className={activeGroup === 'history' ? 'tab-btn on' : 'tab-btn'}
            onClick={() => {
              setActiveGroup('history');
              setSelectedCat('Tümü');
            }}
          >
            🕘 İzleme Geçmişi {history.length > 0 && <span className="count">{history.length}</span>}
          </button>
        </div>

        {/* Gruplandırılmış Kategori Butonları */}
        <div className="groups-container">
          {groups.map((g) => (
            <div key={g.key} className="cat-group-row">
              <span className="group-label">{g.label}</span>
              <div className="group-chips">
                {g.items.map((c) => (
                  <button
                    key={c.name}
                    className={`chip ${selectedCat === c.name ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCat(c.name);
                      setActiveGroup('cat');
                    }}
                  >
                    {c.name} <em className="badge-count">{c.count}</em>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Çok Fonksiyonlu Filtre ve Kontrol Barı */}
      <div className="controls-bar">
        <div className="filters-row">
          {/* Tür Seçimi */}
          <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)} className="select-box">
            <option value="">🎭 Tüm Türler</option>
            {GENRE_LIST.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {/* Yıl Seçimi */}
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="select-box">
            <option value="">📅 Tüm Yıllar</option>
            {YEAR_LIST.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* IMDb Puanı */}
          <select value={minImdb} onChange={(e) => setMinImdb(+e.target.value)} className="select-box">
            <option value={0}>⭐ Tüm IMDb Puanları</option>
            <option value={8.5}>IMDb 8.5+ (Başyapıtlar)</option>
            <option value={8.0}>IMDb 8.0+ (Çok İyi)</option>
            <option value={7.0}>IMDb 7.0+ (İyi)</option>
            <option value={6.0}>IMDb 6.0+ (Ortalama)</option>
          </select>

          {/* Dil Seçeneği */}
          <select value={selectedLang} onChange={(e) => setSelectedLang(e.target.value)} className="select-box">
            <option value="">🗣️ Tüm Diller</option>
            <option value="Türkçe Dublaj">Türkçe Dublaj</option>
            <option value="Türkçe Altyazılı">Türkçe Altyazılı</option>
            <option value="Dual">Dual (Çift Ses)</option>
          </select>

          {/* Format */}
          <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)} className="select-box">
            <option value="">📺 Film & Dizi</option>
            <option value="film">Sadece Filmler</option>
            <option value="dizi">Sadece Diziler</option>
          </select>

          {/* Sıralama */}
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="select-box sort-box">
            <option value="default">↕ Önerilen Sıra</option>
            <option value="year_desc">Çıkış Yılı (Yeni → Eski)</option>
            <option value="year_asc">Çıkış Yılı (Eski → Yeni)</option>
            <option value="imdb">IMDb Puanı (Yüksek → Düşük)</option>
            <option value="az">İsim (A → Z)</option>
            <option value="za">İsim (Z → A)</option>
          </select>

          {/* Aktif Filtreleri Temizle */}
          {hasActiveFilters && (
            <button className="btn-clear-filters" onClick={clearAllFilters}>
              Filtreleri Temizle ✕
            </button>
          )}
        </div>

        <div className="view-and-count">
          <span className="results-count">
            <b>{filtered.length.toLocaleString('tr')}</b> içerik bulundu
          </span>

          <div className="view-modes">
            <button
              className={`vm-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Standart Kart Görünümü"
            >
              🔲
            </button>
            <button
              className={`vm-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => setViewMode('compact')}
              title="Kompakt Izgara"
            >
              ▦
            </button>
            <button
              className={`vm-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Detaylı Liste Görünümü"
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* Siteden Canlı Listeler Paneli */}
      <details className="live-accordion">
        <summary className="live-summary">
          <span>⚡ Siteden Canlı Akış Listeleri (Anlık Web Scraping)</span>
          <small>Sitedeki en yeni güncellemeleri anında çekmek için tıklayın</small>
        </summary>
        <div className="live-buttons-grid">
          {LIVE_KEYS.map(([k, n]) => (
            <button
              key={k}
              className={`live-tag ${live.key === k ? 'active' : ''}`}
              onClick={() => loadLive(k, 1)}
            >
              {n}
            </button>
          ))}
        </div>
      </details>

      {live.key && (
        <section className="live-results-sec">
          <div className="live-sec-hdr">
            <h3>⚡ {LIVE_KEYS.find(([k]) => k === live.key)?.[1]} <small>(Siteden Canlı)</small></h3>
            <button className="btn-close-live" onClick={() => setLive({ key: null, page: 1, movies: [], hasMore: false, loading: false })}>
              Kapat ✕
            </button>
          </div>
          {live.loading && !live.movies.length && <p className="info-msg">Canlı liste siteden alınıyor…</p>}
          <MovieGrid
            movies={live.movies}
            viewMode={viewMode}
            favs={favs}
            toggleFav={toggleFav}
            onPreview={setPreviewMovie}
          />
          {live.hasMore && (
            <button
              className="btn-load-more"
              disabled={live.loading}
              onClick={() => loadLive(live.key, live.page + 1)}
            >
              {live.loading ? 'Yükleniyor…' : 'Daha Fazla Yükle'}
            </button>
          )}
        </section>
      )}

      {/* Yükleniyor / Boş Durumlar */}
      {loading && (
        <div className="loading-state">
          <div className="spinner-main" />
          <p>Film kataloğu hazırlanıyor…</p>
        </div>
      )}

      {!loading && !data.movies.length && (
        <div className="empty-box">
          <h2>Katalog Henüz Yüklenmedi</h2>
          <p>Kataloğu yenilemek için <code>python3 scraper.py</code> komutunu çalıştırabilirsiniz.</p>
        </div>
      )}

      {!loading && data.movies.length > 0 && filtered.length === 0 && (
        <div className="empty-box">
          <h2>Sonuç Bulunamadı</h2>
          <p>Arama kriterlerinize uygun film bulunamadı. Lütfen filtreleri gevşetmeyi deneyin.</p>
          <button className="btn-red-action" onClick={clearAllFilters}>Filtreleri Sıfırla</button>
        </div>
      )}

      {/* Film Izgarası */}
      <MovieGrid
        movies={shown}
        viewMode={viewMode}
        favs={favs}
        toggleFav={toggleFav}
        onPreview={setPreviewMovie}
      />

      {/* Sonsuz Kaydırma İşaretçisi */}
      <div ref={sentinel} style={{ height: 1 }} />
      {shown.length < filtered.length && (
        <p className="scroll-hint">
          Aşağı kaydırdıkça filmler yükleniyor… ({shown.length} / {filtered.length})
        </p>
      )}

      {/* Hızlı Önizleme Modalı */}
      {previewMovie && (
        <div className="modal-overlay" onClick={() => setPreviewMovie(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-preview" onClick={() => setPreviewMovie(null)}>✕</button>
            <div className="preview-backdrop" style={{ backgroundImage: `url(${previewMovie.backdrop || previewMovie.poster})` }}>
              <div className="preview-fade" />
            </div>
            <div className="preview-body">
              <img src={previewMovie.poster} alt={previewMovie.title} className="preview-poster" />
              <div className="preview-info">
                <h3>{previewMovie.title}</h3>
                <div className="preview-badges">
                  {previewMovie.imdb && <span className="imdb-pill">★ {previewMovie.imdb.toFixed(1)} IMDb</span>}
                  {previewMovie.year && <span className="meta-pill">{previewMovie.year}</span>}
                  {previewMovie.duration && <span className="meta-pill">{previewMovie.duration}</span>}
                  {previewMovie.quality && <span className="meta-pill">{previewMovie.quality}</span>}
                </div>
                <p className="preview-desc">{previewMovie.description || 'Açıklama bulunamadı.'}</p>
                {previewMovie.cast?.length > 0 && (
                  <p className="preview-cast"><b>Oyuncular:</b> {previewMovie.cast.join(', ')}</p>
                )}
                <div className="preview-actions">
                  <Link
                    href={`/watch/${encodeURIComponent(previewMovie.id)}?u=${encodeURIComponent(previewMovie.href)}`}
                    className="btn-play-now"
                  >
                    ▶ Hemen İzle
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API & Key Ayarları Modalı */}
      {showKeySettings && (
        <div className="modal-overlay" onClick={() => setShowKeySettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-hdr">
              <h3>🔑 API Key & Proxy Ayarları</h3>
              <button onClick={() => setShowKeySettings(false)}>✕</button>
            </div>
            <div className="settings-body">
              <p>
                Site Cloudflare koruması veya bölgesel kısıtlamalar altındayken sorunsuz scraping ve video akışı için anahtarlarınızı buraya kaydedebilirsiniz.
              </p>
              
              <label>ZenRows API Key (Önerilen Cloudflare Bypass):</label>
              <input
                type="text"
                placeholder="Örn: 9a7b... veya zr_..."
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
              />

              <div className="settings-footer">
                <button
                  className="btn-red-action"
                  onClick={() => {
                    localStorage.setItem('hdfc_user_key', userKey);
                    setShowKeySettings(false);
                    alert('Ayarlar kaydedildi!');
                  }}
                >
                  Kaydet
                </button>
                <button
                  className="btn-gray-action"
                  onClick={() => {
                    setUserKey('');
                    localStorage.removeItem('hdfc_user_key');
                    setShowKeySettings(false);
                  }}
                >
                  Temizle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .main-wrap {
          min-height: 100vh;
          background: #0a0a0a;
          color: #fff;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding-bottom: 80px;
        }
        .site-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 28px;
          background: rgba(13, 13, 13, 0.95);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 50;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          gap: 18px;
          flex-wrap: wrap;
        }
        .hdr-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo {
          color: #e50914;
          font-weight: 900;
          font-size: 24px;
          letter-spacing: -0.5px;
          text-decoration: none;
        }
        .logo span {
          color: #fff;
          font-weight: 300;
          font-size: 14px;
          margin-left: 4px;
          letter-spacing: 0.1em;
        }
        .badge-bot {
          background: #222;
          color: #e50914;
          border: 1px solid #333;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .search-bar {
          flex: 1;
          min-width: 260px;
          max-width: 600px;
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-ico {
          position: absolute;
          left: 12px;
          font-size: 14px;
          opacity: 0.5;
        }
        .search-bar input {
          width: 100%;
          background: #181818;
          border: 1px solid #333;
          color: #fff;
          padding: 10px 40px 10px 36px;
          border-radius: 99px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-bar input:focus {
          border-color: #e50914;
          box-shadow: 0 0 12px rgba(229, 9, 20, 0.35);
        }
        .clear-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: 0;
          color: #aaa;
          cursor: pointer;
          font-size: 14px;
        }
        .search-spin {
          position: absolute;
          right: 34px;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #e50914;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .hdr-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .btn-settings {
          background: #1c1c1c;
          border: 1px solid #333;
          color: #ffb300;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn-settings:hover { background: #282828; }
        .stats-pill {
          background: #151515;
          padding: 6px 12px;
          border-radius: 99px;
          font-size: 12.5px;
          color: #aaa;
        }
        .stats-pill span { color: #fff; font-weight: 700; }

        .hero-banner {
          position: relative;
          min-height: 420px;
          background-size: cover;
          background-position: center 20%;
          display: flex;
          align-items: center;
          padding: 40px 32px;
          margin-bottom: 24px;
        }
        .hero-content {
          max-width: 650px;
          z-index: 2;
        }
        .hero-tag {
          background: #e50914;
          font-size: 11px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }
        .hero-title {
          font-size: 38px;
          font-weight: 900;
          margin: 12px 0 10px;
          line-height: 1.15;
          text-shadow: 0 4px 12px rgba(0,0,0,0.8);
        }
        .hero-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .imdb-pill {
          background: #f5c518;
          color: #000;
          font-weight: 900;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        .meta-pill {
          background: rgba(0,0,0,0.6);
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          color: #ddd;
        }
        .genre-pill {
          background: rgba(229, 9, 20, 0.25);
          color: #ff8a80;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        .hero-desc {
          font-size: 14.5px;
          color: #ccc;
          line-height: 1.6;
          margin: 0 0 20px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .hero-actions {
          display: flex;
          gap: 12px;
        }
        .btn-play-hero {
          background: #e50914;
          color: #fff;
          font-weight: 800;
          padding: 12px 28px;
          border-radius: 8px;
          text-decoration: none;
          font-size: 15px;
          transition: transform 0.15s, background 0.15s;
        }
        .btn-play-hero:hover {
          background: #f40612;
          transform: scale(1.04);
        }
        .btn-info-hero {
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
          color: #fff;
          border: 0;
          font-weight: 700;
          padding: 12px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
        }
        .btn-info-hero:hover { background: rgba(255,255,255,0.25); }

        .cat-nav {
          padding: 12px 28px;
          background: #111;
          border-bottom: 1px solid #222;
        }
        .nav-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
          overflow-x: auto;
          scrollbar-width: thin;
        }
        .tab-btn {
          background: #1c1c1c;
          border: 1px solid #2c2c2c;
          color: #ccc;
          padding: 8px 18px;
          border-radius: 99px;
          cursor: pointer;
          font-size: 13.5px;
          font-weight: 700;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .tab-btn.on {
          background: #e50914;
          border-color: #e50914;
          color: #fff;
        }
        .tab-btn.fav-tab.on { background: #f5c518; color: #000; border-color: #f5c518; }
        .tab-btn .count {
          background: rgba(0,0,0,0.3);
          padding: 2px 6px;
          border-radius: 99px;
          font-size: 11px;
          margin-left: 6px;
        }

        .groups-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .cat-group-row {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: 4px;
        }
        .group-label {
          font-size: 11.5px;
          font-weight: 800;
          text-transform: uppercase;
          color: #777;
          min-width: 120px;
          flex-shrink: 0;
        }
        .group-chips {
          display: flex;
          gap: 6px;
          flex-wrap: nowrap;
        }
        .chip {
          background: #181818;
          border: 1px solid #262626;
          color: #bbb;
          padding: 5px 12px;
          border-radius: 99px;
          cursor: pointer;
          font-size: 12.5px;
          white-space: nowrap;
          transition: all 0.12s;
        }
        .chip:hover { background: #222; color: #fff; }
        .chip.active {
          background: #e50914;
          border-color: #e50914;
          color: #fff;
          font-weight: 700;
        }
        .badge-count {
          font-style: normal;
          font-size: 10.5px;
          opacity: 0.7;
          margin-left: 4px;
        }

        .controls-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 28px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .filters-row {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .select-box {
          background: #181818;
          border: 1px solid #333;
          color: #ddd;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          outline: none;
          cursor: pointer;
        }
        .select-box:focus { border-color: #e50914; }
        .sort-box { border-color: #444; color: #ffb300; }
        .btn-clear-filters {
          background: #2a1515;
          border: 1px solid #522;
          color: #ff8a80;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .view-and-count {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .results-count { font-size: 13.5px; color: #888; }
        .results-count b { color: #fff; }
        .view-modes {
          display: flex;
          background: #181818;
          border-radius: 8px;
          padding: 2px;
          border: 1px solid #333;
        }
        .vm-btn {
          background: none;
          border: 0;
          color: #777;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }
        .vm-btn.active { background: #333; color: #fff; }

        .live-accordion {
          margin: 0 28px 16px;
          background: #14120f;
          border: 1px solid rgba(255, 179, 0, 0.25);
          border-radius: 10px;
          padding: 10px 16px;
        }
        .live-summary {
          cursor: pointer;
          color: #ffb300;
          font-weight: 700;
          font-size: 13.5px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .live-summary small { color: #888; font-weight: 400; font-size: 12px; }
        .live-buttons-grid {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        .live-tag {
          background: #1e1e1e;
          border: 1px solid #333;
          color: #ccc;
          padding: 6px 12px;
          border-radius: 99px;
          font-size: 12px;
          cursor: pointer;
        }
        .live-tag.active { background: #ffb300; color: #000; font-weight: 700; }

        .live-results-sec {
          margin: 0 28px 24px;
          background: #14120f;
          border: 1px solid #ffb300;
          border-radius: 12px;
          padding: 18px;
        }
        .live-sec-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .live-sec-hdr h3 { margin: 0; color: #ffb300; font-size: 16px; }
        .btn-close-live {
          background: none;
          border: 1px solid #444;
          color: #aaa;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-load-more {
          display: block;
          margin: 20px auto 0;
          background: #ffb300;
          color: #000;
          font-weight: 800;
          border: 0;
          padding: 10px 24px;
          border-radius: 8px;
          cursor: pointer;
        }

        .loading-state, .empty-box {
          text-align: center;
          padding: 80px 20px;
          color: #aaa;
        }
        .spinner-main {
          width: 50px;
          height: 50px;
          border: 4px solid #222;
          border-top-color: #e50914;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px;
        }
        .btn-red-action {
          background: #e50914;
          color: #fff;
          border: 0;
          padding: 10px 22px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 14px;
        }
        .scroll-hint {
          text-align: center;
          color: #666;
          font-size: 13px;
          padding: 24px;
        }

        /* Modallar */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }
        .preview-modal {
          background: #141414;
          border: 1px solid #333;
          border-radius: 12px;
          width: min(700px, 95vw);
          max-height: 90vh;
          overflow: hidden;
          position: relative;
          box-shadow: 0 20px 60px rgba(0,0,0,0.9);
        }
        .close-preview {
          position: absolute;
          right: 14px;
          top: 14px;
          background: rgba(0,0,0,0.7);
          border: 0;
          color: #fff;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          z-index: 10;
          font-size: 16px;
        }
        .preview-backdrop {
          height: 200px;
          background-size: cover;
          background-position: center;
          position: relative;
        }
        .preview-fade {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 0%, #141414 100%);
        }
        .preview-body {
          display: flex;
          gap: 20px;
          padding: 0 24px 24px;
          margin-top: -60px;
          position: relative;
          z-index: 2;
        }
        .preview-poster {
          width: 140px;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.8);
          flex-shrink: 0;
        }
        .preview-info { flex: 1; }
        .preview-info h3 { margin: 0 0 10px; font-size: 20px; }
        .preview-badges { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
        .preview-desc { font-size: 13.5px; color: #ccc; line-height: 1.55; margin: 0 0 12px; }
        .preview-cast { font-size: 12.5px; color: #888; margin: 0 0 16px; }
        .btn-play-now {
          background: #e50914;
          color: #fff;
          font-weight: 800;
          padding: 10px 22px;
          border-radius: 8px;
          text-decoration: none;
          display: inline-block;
          font-size: 14px;
        }

        .settings-modal {
          background: #181818;
          border: 1px solid #333;
          border-radius: 12px;
          width: min(500px, 95vw);
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.9);
        }
        .settings-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .settings-hdr h3 { margin: 0; color: #ffb300; font-size: 17px; }
        .settings-hdr button { background: none; border: 0; color: #aaa; font-size: 18px; cursor: pointer; }
        .settings-body p { font-size: 13px; color: #aaa; line-height: 1.5; margin: 0 0 14px; }
        .settings-body label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; color: #ddd; }
        .settings-body input {
          width: 100%;
          box-sizing: border-box;
          background: #111;
          border: 1px solid #444;
          color: #fff;
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 14px;
          margin-bottom: 16px;
          outline: none;
        }
        .settings-body input:focus { border-color: #ffb300; }
        .settings-footer { display: flex; gap: 10px; }
        .btn-gray-action {
          background: #333;
          border: 0;
          color: #fff;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .site-hdr { padding: 12px 16px; }
          .cat-nav { padding: 10px 16px; }
          .controls-bar { padding: 12px 16px; }
          .hero-banner { padding: 24px 16px; min-height: 320px; }
          .hero-title { font-size: 26px; }
          .preview-body { flex-direction: column; margin-top: -30px; }
          .preview-poster { width: 100px; }
        }
      `}</style>
    </main>
  );
}

const GENRE_LIST = [
  'Aksiyon', 'Macera', 'Animasyon', 'Bilim Kurgu', 'Biyografi', 'Komedi', 'Suç',
  'Belgesel', 'Dram', 'Aile', 'Fantastik', 'Tarih', 'Korku', 'Müzik', 'Gizem',
  'Romantik', 'Savaş', 'Spor', 'Gerilim', 'Western', 'Polisiye', 'Anime',
];

const YEAR_LIST = [
  '2026', '2025', '2024', '2023', '2022', '2021', '2020',
  '2015-2019', '2010-2014', '2000-2009', '1990-1999', '1980 Öncesi',
];

const LIVE_KEYS = [
  ['home', 'Yeni Eklenenler'],
  ['all', 'Tüm Filmler'],
  ['vizyon', 'Vizyondaki Filmler'],
  ['nette-ilk', 'Nette İlk'],
  ['tavsiye', 'Tavsiye'],
  ['imdb7', 'IMDb 7+'],
  ['liked', 'En Çok Beğenilenler'],
  ['commented', 'En Çok Yorumlananlar'],
  ['aksiyon', 'Aksiyon'],
  ['bilim-kurgu', 'Bilim Kurgu'],
  ['komedi', 'Komedi'],
  ['korku', 'Korku'],
  ['animasyon', 'Animasyon'],
  ['dram', 'Dram'],
  ['gerilim', 'Gerilim'],
  ['series', 'Popüler Diziler'],
];

/* ── Film Kartları & Görünüm Bileşeni ──────────────────────── */
function MovieGrid({ movies, viewMode, favs, toggleFav, onPreview }) {
  if (!movies.length) return null;

  if (viewMode === 'list') {
    return (
      <div className="list-layout">
        {movies.map((m) => (
          <div key={m.id + m.href} className="list-item">
            <Link
              href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`}
              className="list-poster-wrap"
            >
              <img src={m.poster} alt={m.title} loading="lazy" />
              {m.imdb && <span className="imdb-tag">★ {m.imdb.toFixed(1)}</span>}
            </Link>

            <div className="list-info">
              <div className="list-title-row">
                <Link
                  href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`}
                  className="list-title"
                >
                  {m.title}
                </Link>
                <button
                  className={`fav-btn ${favs.includes(m.id) ? 'on' : ''}`}
                  onClick={(e) => toggleFav(m, e)}
                >
                  {favs.includes(m.id) ? '★' : '☆'}
                </button>
              </div>

              <div className="list-meta">
                {m.year && <span>{m.year}</span>}
                {m.duration && <span>{m.duration}</span>}
                {m.quality && <span>{m.quality}</span>}
                {m.genres?.map((g) => (
                  <span key={g} className="g-tag">{g}</span>
                ))}
              </div>

              <p className="list-desc">{m.description || 'Özet bilgisi için filme tıklayın.'}</p>

              <div className="list-actions">
                <Link
                  href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`}
                  className="btn-watch"
                >
                  ▶ İzle
                </Link>
                <button className="btn-preview" onClick={() => onPreview(m)}>
                  Önizleme
                </button>
              </div>
            </div>
          </div>
        ))}

        <style jsx>{`
          .list-layout {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 0 28px;
          }
          .list-item {
            display: flex;
            gap: 16px;
            background: #141414;
            border: 1px solid #222;
            border-radius: 10px;
            padding: 12px;
            transition: border-color 0.15s, transform 0.15s;
          }
          .list-item:hover {
            border-color: #444;
            transform: translateX(4px);
          }
          .list-poster-wrap {
            position: relative;
            width: 90px;
            aspect-ratio: 2/3;
            border-radius: 6px;
            overflow: hidden;
            flex-shrink: 0;
          }
          .list-poster-wrap img { width: 100%; height: 100%; object-fit: cover; }
          .imdb-tag {
            position: absolute;
            left: 4px;
            top: 4px;
            background: #f5c518;
            color: #000;
            font-size: 10px;
            font-weight: 900;
            padding: 1px 5px;
            border-radius: 4px;
          }
          .list-info { flex: 1; }
          .list-title-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .list-title {
            color: #fff;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
          }
          .list-title:hover { color: #e50914; }
          .fav-btn {
            background: none;
            border: 0;
            color: #888;
            font-size: 18px;
            cursor: pointer;
          }
          .fav-btn.on { color: #f5c518; }
          .list-meta {
            display: flex;
            gap: 6px;
            margin: 6px 0;
            font-size: 12px;
            color: #aaa;
            flex-wrap: wrap;
          }
          .list-meta span { background: #222; padding: 2px 7px; border-radius: 4px; }
          .list-meta .g-tag { background: #2b1717; color: #ff8a80; }
          .list-desc {
            font-size: 13px;
            color: #999;
            margin: 0 0 10px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .list-actions { display: flex; gap: 8px; }
          .btn-watch {
            background: #e50914;
            color: #fff;
            text-decoration: none;
            padding: 5px 14px;
            border-radius: 6px;
            font-size: 12.5px;
            font-weight: 700;
          }
          .btn-preview {
            background: #262626;
            border: 0;
            color: #ccc;
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 12.5px;
            cursor: pointer;
          }
          @media (max-width: 600px) {
            .list-layout { padding: 0 16px; }
            .list-poster-wrap { width: 75px; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`grid-layout ${viewMode === 'compact' ? 'compact' : ''}`}>
      {movies.map((m) => (
        <div key={m.id + m.href} className="card">
          <Link
            href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`}
            className="poster-link"
          >
            <img
              src={m.poster}
              alt={m.title}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
            />
            {m.imdb && <span className="imdb-badge">★ {m.imdb.toFixed(1)}</span>}
            {m.year && <span className="year-badge">{m.year}</span>}
            {m.type === 'dizi' && <span className="dizi-badge">DİZİ</span>}
            {m.quality && <span className="quality-badge">{m.quality}</span>}
            <div className="play-overlay">
              <span className="play-icon">▶</span>
            </div>
          </Link>

          <button
            className={`fav-btn ${favs.includes(m.id) ? 'on' : ''}`}
            onClick={(e) => toggleFav(m, e)}
            title="Favorilere Ekle"
          >
            {favs.includes(m.id) ? '★' : '☆'}
          </button>

          <div className="card-info">
            <Link
              href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`}
              className="card-title"
              title={m.title}
            >
              {m.title}
            </Link>
            <div className="card-meta">
              <span>{m.genres?.slice(0, 2).join(' · ') || m.categories?.slice(0, 2).join(' · ')}</span>
              <button className="preview-btn" onClick={() => onPreview(m)} title="Önizleme">
                ℹ
              </button>
            </div>
          </div>
        </div>
      ))}

      <style jsx>{`
        .grid-layout {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 18px;
          padding: 0 28px;
        }
        .grid-layout.compact {
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
        }
        .card {
          position: relative;
          background: #141414;
          border-radius: 10px;
          overflow: hidden;
          transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .poster-link {
          position: relative;
          display: block;
          aspect-ratio: 2/3;
          background: #1e1e1e;
          overflow: hidden;
        }
        .poster-link img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.3s;
        }
        .card:hover .poster-link img {
          transform: scale(1.06);
        }
        .imdb-badge {
          position: absolute;
          left: 6px;
          top: 6px;
          background: #f5c518;
          color: #000;
          font-size: 11px;
          font-weight: 900;
          padding: 2px 6px;
          border-radius: 4px;
          z-index: 2;
        }
        .year-badge {
          position: absolute;
          right: 6px;
          top: 6px;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px);
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          z-index: 2;
        }
        .dizi-badge {
          position: absolute;
          left: 6px;
          bottom: 6px;
          background: #2962ff;
          font-size: 10px;
          font-weight: 900;
          padding: 2px 6px;
          border-radius: 4px;
          z-index: 2;
        }
        .quality-badge {
          position: absolute;
          right: 6px;
          bottom: 6px;
          background: rgba(229, 9, 20, 0.85);
          font-size: 9.5px;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 4px;
          z-index: 2;
        }
        .fav-btn {
          position: absolute;
          right: 8px;
          bottom: 46px;
          background: rgba(0,0,0,0.65);
          border: 0;
          color: #fff;
          font-size: 16px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.15s, transform 0.15s;
          z-index: 5;
        }
        .card:hover .fav-btn, .fav-btn.on {
          opacity: 1;
        }
        .fav-btn.on { color: #f5c518; }
        .play-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.5);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .card:hover .play-overlay { opacity: 1; }
        .play-icon {
          width: 44px;
          height: 44px;
          background: #e50914;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: #fff;
          box-shadow: 0 4px 16px rgba(229,9,20,0.6);
          transform: scale(0.85);
          transition: transform 0.2s;
        }
        .card:hover .play-icon { transform: scale(1); }

        .card-info {
          padding: 8px 10px;
        }
        .card-title {
          display: block;
          color: #fff;
          text-decoration: none;
          font-size: 13.5px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.15s;
        }
        .card-title:hover { color: #e50914; }
        .card-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #777;
          margin-top: 4px;
        }
        .card-meta span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .preview-btn {
          background: none;
          border: 0;
          color: #666;
          cursor: pointer;
          font-size: 12px;
          padding: 0 2px;
        }
        .preview-btn:hover { color: #fff; }

        @media (max-width: 600px) {
          .grid-layout {
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 10px;
            padding: 0 14px;
          }
        }
      `}</style>
    </div>
  );
}
