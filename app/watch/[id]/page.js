'use client';

import { useEffect, useState, useRef, Suspense, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import HlsPlayer from '../../../components/HlsPlayer';
import { useTvNav } from '../../../components/TvNav';
import { fallbackPoster } from '../../../lib/poster';

export default function WatchPage() {
  return (
    <Suspense fallback={<div className="loading-pg">Film yükleniyor…</div>}>
      <Watch />
    </Suspense>
  );
}

function Watch() {
  const router = useRouter();
  const stageRef = useRef(null);
  const { id } = useParams();
  const sp = useSearchParams();
  const rawPageUrl = sp.get('u');
  const pageUrl = rawPageUrl || `https://hdfilmcehennemi.la/${id}/`;

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState(null);
  const [mode, setMode] = useState('player'); // 'player' | 'iframe'
  const [userKey, setUserKey] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [customStreamInput, setCustomStreamInput] = useState('');
  const [showTrailer, setShowTrailer] = useState(false);

  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('hdfc_user_key') || '';
      setUserKey(savedKey);
      setKeyInput(savedKey);
    } catch { /* */ }
  }, []);

  const resolve = useCallback(async (forcedKey = userKey, customM3u8 = '') => {
    setState({ loading: true, error: null, data: null });
    try {
      let endpoint = `/api/video?url=${encodeURIComponent(pageUrl)}`;
      if (forcedKey) endpoint += `&key=${encodeURIComponent(forcedKey)}`;
      if (customM3u8) endpoint += `&customM3u8=${encodeURIComponent(customM3u8)}`;

      const r = await fetch(endpoint).then((x) => x.json());
      if (r.error && !r.sources?.length) {
        throw new Error(r.detay || r.error);
      }

      setState({ loading: false, error: null, data: r });
      setActive(0);

      try {
        const h = JSON.parse(localStorage.getItem('history') || '[]').filter((x) => x.id !== id);
        h.unshift({
          id,
          title: r.title,
          poster: r.poster,
          href: pageUrl,
          year: r.year,
          imdb: r.imdb,
          genres: r.genres,
          at: Date.now(),
        });
        localStorage.setItem('history', JSON.stringify(h.slice(0, 80)));
      } catch { /* */ }
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  }, [pageUrl, userKey, id]);

  useEffect(() => {
    if (pageUrl) resolve();
  }, [pageUrl, resolve]); // eslint-disable-line

  useEffect(() => {
    if (!pageUrl) return;
    fetch(`/api/detail?url=${encodeURIComponent(pageUrl)}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setDetail(d); })
      .catch(() => {});
  }, [pageUrl]);

  /* TV: kaynaklar yüklendiğinde (fare kullanılmadıysa) ilk kaynağa odak at */
  useEffect(() => {
    if (state.data?.sources?.length && document.activeElement === document.body) {
      const first = document.querySelector('.src-btn');
      if (first) first.focus({ preventScroll: true });
    }
  }, [state.data]);

  /* TV: ESC → kataloğa dön; ESC modal açıkken modalı kapatır */
  const handleEscape = useCallback(() => {
    if (showKeyModal) { setShowKeyModal(false); return; }
    if (showTrailer) { setShowTrailer(false); return; }
    router.push('/');
  }, [showKeyModal, showTrailer, router]);

  useTvNav({
    enabled: !state.loading,
    onEscape: handleEscape,
    playerExitKey: 'ArrowUp',
    playerExitFocus: '.src-btn',
  });

  const handleApplyKey = (e) => {
    e.preventDefault();
    setUserKey(keyInput);
    try {
      if (keyInput) localStorage.setItem('hdfc_user_key', keyInput);
      else localStorage.removeItem('hdfc_user_key');
    } catch { /* */ }
    setShowKeyModal(false);
    resolve(keyInput, customStreamInput);
  };

  const src = state.data?.sources?.[active];
  const title = state.data?.title || detail?.title || decodeURIComponent(id || 'Film İzle');
  const trailerUrl = detail?.trailer || state.data?.trailer;
  const poster = detail?.poster || state.data?.poster || '';

  return (
    <div className="pg">
      {/* ── ANA SAHNE ───────────────────────────────────────── */}
      <div data-stage>
        <header className="watch-hdr" data-row>
          <Link href="/" data-fn className="back-btn">← Kataloğa Dön</Link>
          <h1 title={title}>{title}</h1>
          <div className="hdr-actions">
            <button data-fn className="btn-key-hdr" onClick={() => setShowKeyModal(true)}>
              🔑 Key / Özel Akış
            </button>
            <div className="mode-switch">
              <button data-fn className={mode === 'player' ? 'on' : ''} onClick={() => setMode('player')}>
                HLS Player
              </button>
              <button data-fn className={mode === 'iframe' ? 'on' : ''} onClick={() => setMode('iframe')}>
                Site Oynatıcı
              </button>
            </div>
          </div>
        </header>

        {/* Oynatıcı sahnesi: TV'den ok tuşlarıyla focus atınca seek/vol player'a devredilir */}
        <div className="stage-wrap">
          <div className="stage" data-player tabIndex={0} ref={stageRef}>
            {mode === 'iframe' ? (
              <iframe
                src={pageUrl}
                allowFullScreen
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                title="Site Gömülü Oynatıcı"
              />
            ) : state.loading ? (
              <div className="loading-box">
                <div className="spinner" />
                <h3>Video Kaynakları Çözülüyor…</h3>
                <p>M3U8 şifreleri, AES-128 anahtarları ve alternatif sunucular taranıyor</p>
              </div>
            ) : state.error && !state.data?.sources?.length ? (
              <div className="error-box">
                <div className="err-ico">⚠️</div>
                <h3>Kaynak Çözülemedi</h3>
                <p>{state.error}</p>
                <div className="err-btns">
                  <button className="btn-red" onClick={() => resolve()}>Tekrar Dene</button>
                  <button className="btn-gray" onClick={() => setShowKeyModal(true)}>Key / Stream Ekle</button>
                  <button className="btn-gray" onClick={() => setMode('iframe')}>Site Oynatıcıya Geç</button>
                  <a href={pageUrl} target="_blank" rel="noreferrer" className="btn-gray">Sitede Aç ↗</a>
                </div>
              </div>
            ) : (
              <HlsPlayer
                key={src?.proxyUrl || src?.m3u8Url}
                src={src?.proxyUrl || src?.m3u8Url}
                subtitles={src?.subtitles || []}
                poster={detail?.backdrop || poster || fallbackPoster(title, detail?.year || state.data?.year, (detail?.genres || state.data?.genres || [])[0])}
                title={title}
                storageKey={id}
                sources={state.data?.sources || []}
                activeSource={active}
                onSourceChange={setActive}
                userKey={userKey}
                onKeyChange={(k) => { setUserKey(k); resolve(k); }}
                onCustomStream={(url) => { setCustomStreamInput(url); resolve(userKey, url); }}
              />
            )}
          </div>
          <p className="stage-hint">
            🎮 Uzaktan kumanda: oynatıcıya odak atınca <b>← →</b> sarma · <b>↑ ↓</b> ses · <b>ESC</b> menü · kaynağa dönmek için <b>↑</b>
          </p>
        </div>

        {/* Kaynak seçimi */}
        {state.data && state.data.sources.length > 0 && (
          <section className="sources-bar" data-row>
            <span className="lbl">📡 Yayın Kaynakları:</span>
            <div className="src-list">
              {state.data.sources.map((s, i) => (
                <button
                  key={i}
                  data-fn
                  className={`src-btn ${i === active ? 'active' : ''}`}
                  onClick={() => { setActive(i); setMode('player'); }}
                >
                  {s.lang && <span className="lang-tag">{s.lang}</span>}
                  {s.name}
                  {s.subtitles?.length ? ` · ${s.subtitles.length} Alt` : ''}
                </button>
              ))}
              <button
                data-fn
                className="src-btn src-player"
                title="Odağı oynatıcıya at (ok tuşları: sarma/ses)"
                onClick={() => stageRef.current?.focus()}
              >
                ▶ Oynatıcı
              </button>
            </div>
            {src && (
              <div className="src-tools">
                <button
                  className="link-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(src.m3u8Url);
                    alert('Orijinal M3U8 linki panoya kopyalandı!');
                  }}
                >
                  📋 M3U8 Kopyala
                </button>
                <a href={src.proxyUrl} target="_blank" rel="noreferrer" className="link-btn">🔗 Proxy URL</a>
              </div>
            )}
          </section>
        )}

        {state.data?.errors?.length > 0 && (
          <p className="errors-note">ℹ {state.data.errors.join(' · ')}</p>
        )}

        {/* Dizi bölümleri */}
        {detail?.episodes?.length > 0 && (
          <section className="episodes-sec" data-row>
            <h3>📺 Sezon & Bölümler</h3>
            <div className="episodes-grid">
              {detail.episodes.map((ep, idx) => (
                <Link
                  key={idx}
                  href={`/watch/${encodeURIComponent(id)}?u=${encodeURIComponent(ep.href)}`}
                  data-fn
                  className="ep-btn"
                >
                  {ep.title}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Detaylı film bilgileri */}
        {(detail || state.data) && (
          <section className="meta-card">
            <div className="poster-col">
              <img
                src={poster && !poster.startsWith('data:') ? poster : fallbackPoster(title, detail?.year || state.data?.year, (detail?.genres || state.data?.genres || [])[0])}
                alt={title}
                className="meta-poster"
                onError={(e) => {
                  e.currentTarget.src = fallbackPoster(title, detail?.year || state.data?.year, (detail?.genres || state.data?.genres || [])[0]);
                }}
              />
            </div>

            <div className="info-col">
              <div className="badges-row">
                {(detail?.imdb || state.data?.imdb) && (
                  <span className="imdb-badge">★ {(detail?.imdb || state.data?.imdb).toFixed(1)} IMDb</span>
                )}
                {(detail?.year || state.data?.year) && (
                  <span className="year-badge">{detail?.year || state.data?.year}</span>
                )}
                {detail?.duration && <span className="dur-badge">{detail.duration}</span>}
                {detail?.country && <span className="cnt-badge">{detail.country}</span>}
                {(detail?.genres || state.data?.genres || []).map((g) => (
                  <span key={g} className="genre-badge">{g}</span>
                ))}
              </div>

              <p className="desc">
                {detail?.description || state.data?.description || 'Açıklama bulunamadı.'}
              </p>

              {detail?.director && (
                <p className="cast-line"><b>Yönetmen:</b> {detail.director}</p>
              )}

              {detail?.cast?.length > 0 && (
                <p className="cast-line"><b>Oyuncular:</b> {detail.cast.join(', ')}</p>
              )}

              {trailerUrl && (
                <div className="actions-row">
                  <button className="btn-tr" onClick={() => setShowTrailer(true)}>
                    ▶ Resmi Fragman
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Benzer filmler */}
        {detail?.recommendations?.length > 0 && (
          <section className="recs-sec" data-row>
            <h3>🎬 Benzer Filmler</h3>
            <div className="recs-grid">
              {detail.recommendations.slice(0, 12).map((m) => (
                <Link
                  key={m.id}
                  data-fn
                  className="rec-card"
                  href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`}
                >
                  <div className="rec-img-wrap">
                    <img
                      src={m.poster || fallbackPoster(m.title, m.year)}
                      alt={m.title}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.src = fallbackPoster(m.title, m.year); }}
                    />
                    {m.imdb && <span className="rec-imdb">★ {m.imdb}</span>}
                  </div>
                  <span className="rec-title">{m.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── FRAGMAN MODALI ─────────────────────────────────── */}
      {showTrailer && trailerUrl && (
        <div className="modal-overlay" onClick={() => setShowTrailer(false)}>
          <div className="modal-box" data-stage onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr" data-row>
              <h4>{title} — Fragman</h4>
              <button data-fn className="modal-x" onClick={() => setShowTrailer(false)}>✕</button>
            </div>
            <div className="modal-body">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerUrl.split('v=')[1]?.split('&')[0] || ''}?autoplay=1`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title="Fragman"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── KEY & STREAM MODALI ────────────────────────────── */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal-box" data-stage onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr" data-row>
              <h4>🔑 Key / API / Özel Akış</h4>
              <button data-fn className="modal-x" onClick={() => setShowKeyModal(false)}>✕</button>
            </div>
            <form onSubmit={handleApplyKey} className="modal-form">
              <p className="modal-hint">
                Site Cloudflare korumasındaysa <b>ZenRows</b> veya <b>ScraperAPI</b> anahtarını gir, ya da harici bir
                <b> M3U8 / MP4 </b> akış linkiyle doğrudan oynat.
              </p>

              <label>API Key / ZenRows / ScraperAPI / AES-128 Key:</label>
              <input
                type="text"
                placeholder="Örn: zr_xxxx veya api_key..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />

              <label>Özel M3U8 / HLS Stream URL:</label>
              <input
                type="text"
                placeholder="https://sunucu.com/yayin/master.m3u8"
                value={customStreamInput}
                onChange={(e) => setCustomStreamInput(e.target.value)}
              />

              <div className="modal-footer" data-row>
                <button type="submit" data-fn className="btn-red">Kaydet & Oynat</button>
                <button type="button" data-fn className="btn-gray" onClick={() => setShowKeyModal(false)}>Kapat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .pg {
          min-height: 100vh; background: var(--bg); color: #fff;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          padding-bottom: 60px;
        }
        .watch-hdr {
          position: sticky; top: 0; z-index: 60;
          display: flex; align-items: center; gap: 16px;
          padding: 13px 24px;
          background: rgba(13, 13, 13, 0.94); backdrop-filter: blur(12px);
          border-bottom: 1px solid #222; flex-wrap: wrap;
        }
        .back-btn {
          color: #aaa; text-decoration: none; font-size: 14px; font-weight: 600;
          padding: 6px 10px; border-radius: 6px;
        }
        .back-btn:hover { color: #fff; }
        h1 {
          font-size: 18px; margin: 0; flex: 1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .hdr-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .btn-key-hdr {
          background: #262626; border: 1px solid #444; color: var(--amber);
          padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer;
        }
        .btn-key-hdr:hover { background: #333; }
        .mode-switch { display: flex; background: #222; border-radius: 8px; padding: 3px; }
        .mode-switch button {
          background: none; border: 0; color: #aaa;
          padding: 6px 14px; border-radius: 6px; cursor: pointer;
          font-size: 13px; font-weight: 600;
        }
        .mode-switch button.on { background: var(--brand); color: #fff; }

        .stage-wrap { max-width: 1300px; margin: 16px auto 0; padding: 0 16px; }
        .stage {
          background: #000; width: 100%; aspect-ratio: 16/9;
          position: relative; border-radius: 12px; overflow: hidden;
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.85);
          cursor: pointer;
        }
        .stage iframe { width: 100%; height: 100%; border: 0; }
        .stage-hint { color: #666; font-size: 12px; margin: 10px 4px 0; }
        .stage-hint b { color: #999; }

        .loading-box, .error-box {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 24px; gap: 12px;
        }
        .spinner {
          width: 48px; height: 48px;
          border: 4px solid #333; border-top-color: var(--brand);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-box h3 { margin: 0; font-size: 18px; }
        .loading-box p { color: #888; font-size: 14px; margin: 0; }
        .err-ico { font-size: 42px; }
        .error-box h3 { margin: 0; font-size: 18px; color: #ff8a80; }
        .error-box p { color: #aaa; max-width: 520px; font-size: 14px; margin: 0; }
        .err-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; justify-content: center; }
        .btn-red, .btn-gray {
          border: 0; padding: 9px 18px; border-radius: 6px;
          font-weight: 700; font-size: 13.5px; cursor: pointer; text-decoration: none; color: #fff;
        }
        .btn-red { background: var(--brand); }
        .btn-gray { background: #333; }

        .sources-bar {
          max-width: 1300px; margin: 14px auto 0; padding: 0 16px;
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .lbl { font-size: 13px; font-weight: 700; color: #aaa; white-space: nowrap; }
        .src-list { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
        .src-btn {
          background: #1c1c1c; border: 1px solid #333; color: #ccc;
          padding: 7px 14px; border-radius: 99px; cursor: pointer;
          font-size: 13px; font-weight: 600; transition: all 0.15s;
        }
        .src-btn:hover { background: #272727; color: #fff; }
        .src-btn.active { background: var(--brand); border-color: var(--brand); color: #fff; }
        .src-player { background: rgba(255, 179, 0, 0.14); border-color: rgba(255, 179, 0, 0.55); color: var(--amber); font-weight: 800; }
        .src-player:hover { background: rgba(255, 179, 0, 0.26); }
        .lang-tag {
          background: rgba(0, 0, 0, 0.4); padding: 2px 6px; border-radius: 4px;
          font-size: 10.5px; margin-right: 6px;
        }
        .src-tools { display: flex; gap: 8px; }
        .link-btn {
          background: none; border: 1px solid #333; color: #999;
          padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; text-decoration: none;
        }
        .link-btn:hover { color: #fff; border-color: #555; }

        .errors-note {
          max-width: 1300px; margin: 12px auto 0; padding: 0 16px;
          color: #b98a00; font-size: 12.5px;
        }

        .meta-card {
          max-width: 1300px; margin: 26px auto 0; padding: 0 16px;
          display: flex; gap: 24px; align-items: flex-start;
        }
        .poster-col { flex: 0 0 160px; }
        .meta-poster {
          width: 100%; border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6); display: block;
        }
        .info-col { flex: 1; min-width: 0; }
        .badges-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .imdb-badge {
          background: #f5c518; color: #000; font-weight: 900;
          padding: 4px 10px; border-radius: 99px; font-size: 13px;
        }
        .year-badge, .dur-badge, .cnt-badge {
          background: #242424; padding: 4px 10px; border-radius: 99px;
          font-size: 12.5px; color: #ccc;
        }
        .genre-badge {
          background: #2b1717; color: #ff8a80;
          padding: 4px 10px; border-radius: 99px; font-size: 12.5px;
        }
        .desc { color: #ccc; line-height: 1.6; font-size: 14.5px; margin: 0 0 12px; }
        .cast-line { font-size: 13px; color: #888; margin: 4px 0; }
        .cast-line b { color: #bbb; }
        .actions-row { margin-top: 14px; }
        .btn-tr {
          background: #222; border: 1px solid #444; color: #fff;
          padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer;
        }
        .btn-tr:hover { background: #333; }

        .episodes-sec, .recs-sec { max-width: 1300px; margin: 30px auto 0; padding: 0 16px; }
        .episodes-sec h3, .recs-sec h3 { font-size: 17px; color: #eee; margin-bottom: 14px; }
        .episodes-grid { display: flex; gap: 8px; flex-wrap: wrap; }
        .ep-btn {
          background: #1c1c1c; border: 1px solid #333; color: #ddd;
          padding: 8px 16px; border-radius: 8px; text-decoration: none; font-size: 13px;
        }
        .ep-btn:hover { background: #333; }

        .recs-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
          gap: 14px;
        }
        .rec-card { text-decoration: none; color: #ddd; }
        .rec-img-wrap {
          position: relative; aspect-ratio: 2/3; border-radius: 8px;
          overflow: hidden; background: #1a1a1a; margin-bottom: 6px;
        }
        .rec-img-wrap img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
        .rec-card:hover .rec-img-wrap img { transform: scale(1.05); }
        .rec-imdb {
          position: absolute; left: 6px; top: 6px;
          background: #f5c518; color: #000; font-weight: 800; font-size: 10px;
          padding: 2px 6px; border-radius: 4px;
        }
        .rec-title {
          font-size: 12.5px; font-weight: 600; display: block;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0, 0, 0, 0.86); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .modal-box {
          background: #181818; border: 1px solid #333; border-radius: 12px;
          width: min(650px, 95vw); max-height: 90vh; overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9);
        }
        .modal-hdr {
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
          padding: 14px 20px; background: #202020; border-bottom: 1px solid #333;
        }
        .modal-hdr h4 { margin: 0; font-size: 16px; }
        .modal-x {
          background: none; border: 0; color: #aaa; font-size: 16px; cursor: pointer;
          padding: 4px 8px; border-radius: 6px;
        }
        .modal-x:hover { color: #fff; background: #333; }
        .modal-body { aspect-ratio: 16/9; width: 100%; }
        .modal-body iframe { width: 100%; height: 100%; border: 0; }
        .modal-form { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .modal-hint { font-size: 13px; color: #aaa; margin: 0 0 6px; line-height: 1.5; }
        .modal-form label { font-size: 13px; font-weight: 700; color: #ddd; }
        .modal-form input {
          background: #111; border: 1px solid #444; color: #fff;
          padding: 10px 12px; border-radius: 6px; font-size: 14px; outline: none;
        }
        .modal-form input:focus { border-color: var(--brand); }
        .modal-footer { display: flex; gap: 10px; margin-top: 10px; }

        @media (max-width: 640px) {
          .meta-card { flex-direction: column; }
          .poster-col { width: 120px; }
          .watch-hdr { padding: 10px 14px; }
          h1 { font-size: 15px; }
        }
      `}</style>
    </div>
  );
}
