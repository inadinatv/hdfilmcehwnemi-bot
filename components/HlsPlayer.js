'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * HDFilmCehennemi Özel HLS Oynatıcı
 * 
 * Özellikler:
 * - HLS M3U8, AES-128 şifre çözme anahtarı desteği, özel Key / Token / Header yönetimi
 * - Çoklu kalite seçimi (Auto, 1080p, 720p, 480p, 360p) ve anlık bitrate göstergesi
 * - Çoklu ses parçası (TR Dublaj, Orijinal, vb.)
 * - Altyazı seçimi, özel SRT/VTT dosya yükleme, renk, boyut ve ±5sn senkron kaydırma
 * - Oynatma hızı (0.25x - 3x)
 * - ±10sn ve ±30sn hızlı atlama, hover süre önizlemesi
 * - Sinema Modu (Theater), PiP (Resim içinde resim), Tam ekran (Mobilde yatay kilit)
 * - Ekran görüntüsü alma (PNG indirme)
 * - A-B Tekrar döngüsü ve görsel işaretçiler
 * - Uyku zamanlayıcısı (15 - 120 dk)
 * - İstatistikler & Tanılama paneli (Stats for nerds)
 * - Klavye kısayolları (Space, K, J, L, Sol/Sağ, Yukarı/Aşağı, 0-9, M, F, P, C, S, A, T, I)
 * - Mobilde çift dokunma ve dikey ses/parlaklık kaydırma jestleri
 * - Kaldığı yerden otomatik devam etme
 */
export default function HlsPlayer({
  src,
  subtitles = [],
  poster,
  title,
  storageKey,
  sources = [],
  activeSource = 0,
  onSourceChange,
  onCustomStream,
  userKey = '',
  onKeyChange,
  onError,
}) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimer = useRef(null);
  const fileInputRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [theater, setTheater] = useState(false);
  const [fs, setFs] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(0);

  // Menüler
  const [menu, setMenu] = useState(null); // 'settings' | 'quality' | 'audio' | 'subs' | 'speed' | 'source' | 'sleep' | 'stats' | 'keys' | 'key_input'
  const [customKeyInput, setCustomKeyInput] = useState(userKey || '');
  const [customStreamUrl, setCustomStreamUrl] = useState('');
  const [error, setError] = useState(null);

  // HLS Parçaları
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioTrack, setAudioTrack] = useState(-1);
  const [subTracks, setSubTracks] = useState([]);
  const [subTrack, setSubTrack] = useState(-1);
  const [extraSubs, setExtraSubs] = useState([]);

  // A-B Tekrar & Uyku
  const [loopAB, setLoopAB] = useState({ a: null, b: null });
  const [sleepAt, setSleepAt] = useState(null);
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({});

  // Altyazı Stili & Senkronu
  const [subStyle, setSubStyle] = useState({
    size: 1,
    color: '#ffffff',
    bg: 'rgba(0,0,0,0.75)',
    offset: 0, // saniye
  });

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 1800);
  }, []);

  /* ── HLS Kurulum & Başlatma ─────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let hls;
    let destroyed = false;

    setReady(false);
    setError(null);
    setLevels([]);
    setAudioTracks([]);
    setSubTracks([]);
    setBuffering(true);

    (async () => {
      const Hls = (await import('hls.js')).default;
      if (destroyed) return;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          backBufferLength: 90,
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 5,
          levelLoadingMaxRetry: 5,
          startLevel: -1,
          capLevelToPlayerSize: false,
          xhrSetup: (xhr, url) => {
            if (userKey) {
              xhr.setRequestHeader('X-User-Key', userKey);
            }
          },
        });
        hlsRef.current = hls;

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          const lvls = (data.levels || []).map((l, i) => ({
            i,
            h: l.height,
            w: l.width,
            br: l.bitrate,
            name: l.height ? `${l.height}p` : `${Math.round((l.bitrate || 0) / 1000)} kbps`,
          }));
          setLevels(lvls);

          const audios = (hls.audioTracks || []).map((t, i) => ({
            i,
            name: t.name || t.lang || `Ses ${i + 1}`,
            lang: t.lang,
          }));
          setAudioTracks(audios);
          setAudioTrack(hls.audioTrack);

          const subs = (hls.subtitleTracks || []).map((t, i) => ({
            i,
            name: t.name || t.lang || `Altyazı ${i + 1}`,
          }));
          setSubTracks(subs);
          setReady(true);
          setBuffering(false);

          // Kaldığı yerden devam etme
          if (storageKey) {
            const saved = parseFloat(localStorage.getItem('pos:' + storageKey) || '0');
            if (saved > 10 && saved < (video.duration || Infinity) - 30) {
              video.currentTime = saved;
              flash(`▶ ${fmt(saved)} konumundan devam ediliyor`);
            }
          }
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setLevel(hls.autoLevelEnabled ? -1 : d.level));
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          setAudioTracks((hls.audioTracks || []).map((t, i) => ({
            i,
            name: t.name || t.lang || `Ses ${i + 1}`,
            lang: t.lang,
          })));
        });
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setAudioTrack(d.id));
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
          setSubTracks((hls.subtitleTracks || []).map((t, i) => ({
            i,
            name: t.name || t.lang || `Altyazı ${i + 1}`,
          })));
        });

        hls.on(Hls.Events.FRAG_BUFFERED, (_, d) => {
          const lvl = hls.levels[hls.currentLevel];
          setStats((s) => ({
            ...s,
            level: lvl ? `${lvl.height || 'HD'}p @ ${Math.round((lvl.bitrate || 0) / 1000)} kbps` : 'Otomatik',
            bw: hls.bandwidthEstimate ? `${(hls.bandwidthEstimate / 1e6).toFixed(2)} Mbps` : '-',
            frag: d.frag?.sn,
            dropped: video.getVideoPlaybackQuality?.().droppedVideoFrames || 0,
          }));
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (data.details === 'manifestLoadError' || data.details === 'manifestParsingError') {
              setError('Bu kaynak yüklenemedi. Alternatif kaynakları deneyin veya Key/Stream ekleyin.');
              onError?.(data);
            } else {
              flash('Ağ hatası kurtarılıyor…');
              hls.startLoad();
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            flash('Medya hatası kurtarılıyor…');
            hls.recoverMediaError();
          } else {
            setError('Oynatma hatası: ' + data.details);
            onError?.(data);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        setReady(true);
        setBuffering(false);
        video.play().catch(() => {});
      } else {
        setError('Tarayıcınız HLS akış formatını doğrudan desteklemiyor.');
      }
    })();

    return () => {
      destroyed = true;
      hls?.destroy();
      hlsRef.current = null;
    };
  }, [src, userKey]); // eslint-disable-line

  /* ── Video Olayları & Pozisyon Takibi ─────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTime = () => {
      setCurrent(v.currentTime);
      if (v.buffered.length) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
      if (loopAB.a != null && loopAB.b != null && v.currentTime >= loopAB.b) {
        v.currentTime = loopAB.a;
      }
      if (storageKey && Math.floor(v.currentTime) % 4 === 0) {
        localStorage.setItem('pos:' + storageKey, String(v.currentTime));
      }
      if (sleepAt && Date.now() >= sleepAt) {
        v.pause();
        setSleepAt(null);
        flash('😴 Uyku zamanlayıcı: Film durduruldu');
      }
    };

    const evs = {
      timeupdate: onTime,
      durationchange: () => setDuration(v.duration || 0),
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      waiting: () => setBuffering(true),
      playing: () => setBuffering(false),
      canplay: () => setBuffering(false),
      volumechange: () => {
        setVolume(v.volume);
        setMuted(v.muted);
      },
      ratechange: () => setRate(v.playbackRate),
      ended: () => {
        if (storageKey) localStorage.removeItem('pos:' + storageKey);
      },
    };

    Object.entries(evs).forEach(([k, f]) => v.addEventListener(k, f));
    return () => Object.entries(evs).forEach(([k, f]) => v.removeEventListener(k, f));
  }, [loopAB, sleepAt, storageKey, flash]);

  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  /* ── Kontrol Fonksiyonları ───────────────────────────────── */
  const v = () => videoRef.current;

  const togglePlay = useCallback(() => {
    const x = v();
    if (!x) return;
    if (x.paused) x.play();
    else x.pause();
  }, []);

  const seek = useCallback((d) => {
    const x = v();
    if (!x) return;
    x.currentTime = Math.max(0, Math.min(x.duration || 0, x.currentTime + d));
    flash(`${d > 0 ? '⏩ +' : '⏪ '}${d} sn`);
  }, [flash]);

  const setVol = useCallback((val) => {
    const x = v();
    if (!x) return;
    x.volume = Math.max(0, Math.min(1, val));
    x.muted = x.volume === 0;
    flash(`🔊 %${Math.round(x.volume * 100)}`);
  }, [flash]);

  const toggleMute = useCallback(() => {
    const x = v();
    if (x) {
      x.muted = !x.muted;
      flash(x.muted ? '🔇 Sessiz' : '🔊 Ses Açık');
    }
  }, [flash]);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrapRef.current?.requestFullscreen?.().then(() => {
        try {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        } catch { /* */ }
      }).catch(() => {});
    }
  }, []);

  const togglePip = useCallback(async () => {
    const x = v();
    if (!x) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await x.requestPictureInPicture();
    } catch {
      flash('PiP (Resim içinde resim) desteklenmiyor');
    }
  }, [flash]);

  const changeRate = useCallback((r) => {
    const x = v();
    if (x) {
      x.playbackRate = r;
      flash(`⚡ ${r}x Hız`);
    }
  }, [flash]);

  const changeLevel = (i) => {
    const h = hlsRef.current;
    if (!h) return;
    h.currentLevel = i;
    setLevel(i);
    flash(i === -1 ? 'Otomatik Kalite' : levels.find((l) => l.i === i)?.name || 'Kalite değiştirildi');
    setMenu(null);
  };

  const changeAudio = (i) => {
    const h = hlsRef.current;
    if (!h) return;
    h.audioTrack = i;
    setAudioTrack(i);
    flash(`🎧 Ses: ${audioTracks.find((t) => t.i === i)?.name || i}`);
    setMenu(null);
  };

  const changeSub = (i) => {
    const x = v();
    if (!x) return;
    const h = hlsRef.current;
    if (h) h.subtitleTrack = -1;
    Array.from(x.textTracks || []).forEach((t, idx) => {
      t.mode = idx === i ? 'showing' : 'disabled';
    });
    setSubTrack(i);
    setMenu(null);
    flash(i === -1 ? 'Altyazı Kapalı' : 'Altyazı Açık');
  };

  const handleCustomSubFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setExtraSubs((prev) => [...prev, { url, label: file.name.replace(/\.[^/.]+$/, ''), lang: 'custom' }]);
    flash(`💬 Altyazı yüklendi: ${file.name}`);
    setMenu('subs');
  };

  const screenshot = useCallback(() => {
    const x = v();
    if (!x) return;
    try {
      const c = document.createElement('canvas');
      c.width = x.videoWidth || 1920;
      c.height = x.videoHeight || 1080;
      const ctx = c.getContext('2d');
      ctx.drawImage(x, 0, 0, c.width, c.height);

      // Watermark
      ctx.fillStyle = 'rgba(229, 9, 20, 0.85)';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('HDFilmCehennemi', 30, c.height - 30);

      const a = document.createElement('a');
      const cleanTitle = (title || 'kare').replace(/[^\w\-]+/g, '_');
      a.download = `${cleanTitle}_${fmt(x.currentTime).replace(/:/g, '-')}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
      flash('📸 Ekran görüntüsü kaydedildi');
    } catch {
      flash('Ekran görüntüsü kaydedilemedi (CORS kısıtı)');
    }
  }, [title, flash]);

  const markAB = () => {
    const x = v();
    if (!x) return;
    if (loopAB.a == null) {
      setLoopAB({ a: x.currentTime, b: null });
      flash(`🔁 A noktası: ${fmt(x.currentTime)}`);
    } else if (loopAB.b == null) {
      setLoopAB({ a: loopAB.a, b: x.currentTime });
      flash(`🔁 A-B Döngü Aktif (${fmt(loopAB.a)} - ${fmt(x.currentTime)})`);
    } else {
      setLoopAB({ a: null, b: null });
      flash('Döngü Kapatıldı');
    }
  };

  /* ── Klavye Kısayolları ───────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const x = v();
      if (!x) return;

      const map = {
        ' ': togglePlay,
        k: togglePlay,
        ArrowRight: () => seek(10),
        ArrowLeft: () => seek(-10),
        l: () => seek(10),
        j: () => seek(-10),
        ArrowUp: () => setVol(x.volume + 0.1),
        ArrowDown: () => setVol(x.volume - 0.1),
        m: toggleMute,
        f: toggleFs,
        p: togglePip,
        s: screenshot,
        a: markAB,
        t: () => setTheater((t) => !t),
        i: () => setMenu((m) => (m === 'stats' ? null : 'stats')),
        '>': () => changeRate(Math.min(3, +(x.playbackRate + 0.25).toFixed(2))),
        '<': () => changeRate(Math.max(0.25, +(x.playbackRate - 0.25).toFixed(2))),
        c: () => changeSub(subTrack === -1 ? 0 : -1),
        Escape: () => setMenu(null),
      };

      if (/^[0-9]$/.test(e.key)) {
        x.currentTime = (x.duration || 0) * (+e.key / 10);
        return;
      }

      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, setVol, toggleMute, toggleFs, togglePip, screenshot, changeRate, subTrack]); // eslint-disable-line

  /* ── UI Gizleme Zamanlayıcısı ────────────────────────────── */
  const poke = () => {
    setShowUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!menu && videoRef.current && !videoRef.current.paused) {
        setShowUi(false);
      }
    }, 3200);
  };
  useEffect(() => {
    poke();
    return () => clearTimeout(hideTimer.current);
  }, [menu]); // eslint-disable-line

  /* ── Dokunma & Çift Dokunma Atlama Jestleri ───────────────── */
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const touchStartPos = useRef({ x: 0, y: 0 });

  const onTouchStart = (e) => {
    poke();
    if (e.touches.length === 1) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length !== 1) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dy = touchStartPos.current.y - e.touches[0].clientY;
    const x = e.touches[0].clientX - rect.left;

    if (Math.abs(dy) > 30) {
      if (x < rect.width / 2) {
        // Sol taraf: Parlaklık
        const newBri = Math.max(0.3, Math.min(1.5, brightness + (dy > 0 ? 0.02 : -0.02)));
        setBrightness(newBri);
        flash(`☀️ Parlaklık: %${Math.round((newBri / 1.5) * 100)}`);
      } else {
        // Sağ taraf: Ses
        const newVol = Math.max(0, Math.min(1, volume + (dy > 0 ? 0.02 : -0.02)));
        setVol(newVol);
      }
    }
  };

  const onTap = (e) => {
    const now = Date.now();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left;

    if (now - lastTap.current.t < 300) {
      if (x < rect.width / 3) seek(-10);
      else if (x > (rect.width * 2) / 3) seek(10);
      else toggleFs();
      lastTap.current.t = 0;
    } else {
      lastTap.current = { t: now, x };
      setTimeout(() => {
        if (lastTap.current.t === now) togglePlay();
      }, 300);
    }
  };

  const onSeekBar = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const x = v();
    if (x && duration) x.currentTime = p * duration;
  };

  const onSeekMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(p * duration);
    setHoverPos(e.clientX - rect.left);
  };

  const allSubtitles = [...subtitles, ...extraSubs];
  const pct = duration ? (current / duration) * 100 : 0;
  const bpct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={`player ${showUi ? 'ui' : 'noui'} ${fs ? 'fs' : ''} ${theater ? 'theater' : ''}`}
      onMouseMove={poke}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      style={{
        '--sub-size': `${subStyle.size * 1.15}em`,
        '--sub-color': subStyle.color,
        '--sub-bg': subStyle.bg,
        filter: `brightness(${brightness})`,
      }}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        crossOrigin="anonymous"
        preload="auto"
        onClick={onTap}
        onTouchEnd={(e) => {
          e.preventDefault();
          onTap(e);
        }}
      >
        {allSubtitles.map((s, i) => (
          <track
            key={i}
            kind="subtitles"
            src={s.proxyUrl || s.url}
            label={s.label || `Altyazı ${i + 1}`}
            srcLang={s.lang || 'tr'}
          />
        ))}
      </video>

      {/* Yükleniyor Döndürücüsü */}
      {buffering && !error && (
        <div className="spinner-wrap">
          <div className="spinner" />
          <span>Yükleniyor…</span>
        </div>
      )}

      {/* Bildirim Balonu */}
      {toast && <div className="toast">{toast}</div>}

      {/* Hata Ekranı & Kaynak Değiştirme */}
      {error && (
        <div className="err">
          <div className="err-icon">⚠️</div>
          <div className="err-title">{error}</div>
          <p className="err-sub">Aşağıdaki alternatif kaynaklardan birini seçebilir veya kendi anahtarınızı girebilirsiniz.</p>
          <div className="err-actions">
            {sources.length > 1 && (
              <div className="err-src">
                {sources.map((s, i) => (
                  <button
                    key={i}
                    className={i === activeSource ? 'on' : ''}
                    onClick={() => onSourceChange?.(i)}
                  >
                    {s.lang ? `[${s.lang}] ` : ''}{s.name}
                  </button>
                ))}
              </div>
            )}
            <button className="btn-key" onClick={() => setMenu('key_input')}>🔑 Özel Key / Akış Ekle</button>
          </div>
        </div>
      )}

      {/* Üst Bilgi Barı */}
      <div className="top">
        <div className="ttl" title={title}>{title || 'Film Oynatıcı'}</div>
        <div className="top-badges">
          {loopAB.a != null && <span className="badge loop">🔁 A{loopAB.b != null ? '-B' : ''} Döngü</span>}
          {sleepAt && (
            <span className="badge sleep">
              😴 {Math.max(0, Math.round((sleepAt - Date.now()) / 60000))} dk
            </span>
          )}
          {rate !== 1 && <span className="badge rate">{rate}x</span>}
          {sources[activeSource] && <span className="badge src-badge">{sources[activeSource].name}</span>}
        </div>
      </div>

      {/* Alt Kontrol Barı */}
      <div className="bottom">
        {/* İlerleme Çubuğu */}
        <div
          className="seek"
          onClick={onSeekBar}
          onMouseMove={onSeekMouseMove}
          onMouseLeave={() => setHoverTime(null)}
        >
          <div className="buf" style={{ width: `${bpct}%` }} />
          <div className="prog" style={{ width: `${pct}%` }} />
          {loopAB.a != null && duration > 0 && (
            <div className="mark mark-a" style={{ left: `${(loopAB.a / duration) * 100}%` }} title="A Noktası" />
          )}
          {loopAB.b != null && duration > 0 && (
            <div className="mark mark-b" style={{ left: `${(loopAB.b / duration) * 100}%` }} title="B Noktası" />
          )}
          {hoverTime !== null && (
            <div className="hover-tip" style={{ left: `${hoverPos}px` }}>
              {fmt(hoverTime)}
            </div>
          )}
        </div>

        {/* Buton Kontrolleri */}
        <div className="ctl">
          <button className="btn-play" onClick={togglePlay} title="Oynat / Duraklat (Space/K)">
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => seek(-10)} title="10 sn geri (J / Sol Ok)">↺10</button>
          <button onClick={() => seek(10)} title="10 sn ileri (L / Sağ Ok)">↻10</button>
          
          <div className="vol-wrap">
            <button onClick={toggleMute} title="Sessiz (M)">
              {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              className="vol"
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={muted ? 0 : volume}
              onChange={(e) => setVol(+e.target.value)}
              title="Ses Seviyesi"
            />
          </div>

          <span className="time">{fmt(current)} / {fmt(duration)}</span>

          <div className="grow" />

          {/* Hızlı Butonlar */}
          <button
            className={`btn-tag ${allSubtitles.length + subTracks.length > 0 ? (subTrack >= 0 ? 'on' : '') : 'dis'}`}
            onClick={() => setMenu(menu === 'subs' ? null : 'subs')}
            title="Altyazı Seçenekleri (C)"
          >
            CC
          </button>

          {audioTracks.length > 1 && (
            <button onClick={() => setMenu(menu === 'audio' ? null : 'audio')} title="Ses Parçası / Dublaj">
              🎧
            </button>
          )}

          {levels.length > 1 && (
            <button onClick={() => setMenu(menu === 'quality' ? null : 'quality')} title="Kalite Seçimi">
              {level === -1 ? 'AUTO' : levels.find((l) => l.i === level)?.name || 'HD'}
            </button>
          )}

          {sources.length > 1 && (
            <button onClick={() => setMenu(menu === 'source' ? null : 'source')} title="Yayın Kaynağı Değiştir">
              📡
            </button>
          )}

          <button onClick={() => setMenu(menu === 'key_input' ? null : 'key_input')} title="Key & Özel Akış Ekle">
            🔑
          </button>

          <button onClick={() => setMenu(menu === 'settings' ? null : 'settings')} title="Tüm Ayarlar">
            ⚙️
          </button>

          <button onClick={() => setTheater((t) => !t)} title="Sinema Modu (T)">
            {theater ? '⧉' : '▭'}
          </button>

          <button onClick={togglePip} title="Resim içinde Resim (P)">
            ⧉
          </button>

          <button onClick={toggleFs} title="Tam Ekran (F)">
            {fs ? '🡼' : '⛶'}
          </button>
        </div>
      </div>

      {/* Açılır Menüler */}
      {menu && (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          {menu === 'settings' && (
            <>
              <div className="mh">Oynatıcı Ayarları</div>
              <button onClick={() => setMenu('speed')}>⚡ Oynatma Hızı <span>{rate}x ›</span></button>
              {levels.length > 1 && (
                <button onClick={() => setMenu('quality')}>
                  📺 Görüntü Kalitesi <span>{level === -1 ? 'Otomatik' : levels.find((l) => l.i === level)?.name} ›</span>
                </button>
              )}
              {audioTracks.length > 1 && (
                <button onClick={() => setMenu('audio')}>
                  🎧 Ses Parçası / Dublaj <span>{audioTracks.find((t) => t.i === audioTrack)?.name || '-'} ›</span>
                </button>
              )}
              <button onClick={() => setMenu('subs')}>
                💬 Altyazı & Ayarları <span>{subTrack === -1 ? 'Kapalı' : 'Açık'} ›</span>
              </button>
              {sources.length > 1 && (
                <button onClick={() => setMenu('source')}>
                  📡 Kaynak Sunucu <span>{sources[activeSource]?.name} ›</span>
                </button>
              )}
              <button onClick={() => setMenu('key_input')}>
                🔑 API Key & Özel Akış <span>Yapılandır ›</span>
              </button>
              <button onClick={() => setMenu('sleep')}>
                😴 Uyku Zamanlayıcı <span>{sleepAt ? 'Aktif' : 'Kapalı'} ›</span>
              </button>
              <button onClick={markAB}>
                🔁 A-B Tekrar Döngüsü <span>{loopAB.a == null ? 'A Ayarla' : loopAB.b == null ? 'B Ayarla' : 'Kapat'}</span>
              </button>
              <button onClick={screenshot}>
                📸 Ekran Görüntüsü Al <span>(S tuşu)</span>
              </button>
              <button onClick={() => setMenu('stats')}>
                📊 Yayın İstatistikleri <span>›</span>
              </button>
              <button onClick={() => setMenu('keys')}>
                ⌨️ Klavye Kısayolları <span>›</span>
              </button>
            </>
          )}

          {menu === 'speed' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Oynatma Hızı</div>
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((r) => (
                <button
                  key={r}
                  className={r === rate ? 'on' : ''}
                  onClick={() => {
                    changeRate(r);
                    setMenu(null);
                  }}
                >
                  {r}x {r === 1 ? '(Normal)' : ''}
                </button>
              ))}
            </>
          )}

          {menu === 'quality' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Kalite Seçimi</div>
              <button className={level === -1 ? 'on' : ''} onClick={() => changeLevel(-1)}>
                Otomatik (Önerilen)
              </button>
              {[...levels].sort((a, b) => (b.h || b.br) - (a.h || a.br)).map((l) => (
                <button
                  key={l.i}
                  className={l.i === level ? 'on' : ''}
                  onClick={() => changeLevel(l.i)}
                >
                  {l.name} <span>{Math.round(l.br / 1000)} kbps</span>
                </button>
              ))}
            </>
          )}

          {menu === 'audio' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Ses Parçası (Dublaj)</div>
              {audioTracks.map((t) => (
                <button
                  key={t.i}
                  className={t.i === audioTrack ? 'on' : ''}
                  onClick={() => changeAudio(t.i)}
                >
                  {t.name}
                </button>
              ))}
            </>
          )}

          {menu === 'subs' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Altyazı Seçenekleri</div>
              <button className={subTrack === -1 ? 'on' : ''} onClick={() => changeSub(-1)}>
                Kapalı
              </button>
              {allSubtitles.map((t, i) => (
                <button
                  key={i}
                  className={subTrack === i ? 'on' : ''}
                  onClick={() => changeSub(i)}
                >
                  {t.label || t.lang || `Altyazı ${i + 1}`}
                </button>
              ))}

              <div className="mh">Özel Altyazı Yükle (.srt / .vtt)</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.vtt"
                style={{ display: 'none' }}
                onChange={handleCustomSubFile}
              />
              <button onClick={() => fileInputRef.current?.click()}>
                📁 Bilgisayardan Altyazı Seç…
              </button>

              <div className="mh">Altyazı Boyutu</div>
              <div className="row">
                {[0.8, 1, 1.25, 1.5, 1.8].map((s) => (
                  <button
                    key={s}
                    className={subStyle.size === s ? 'on' : ''}
                    onClick={() => setSubStyle({ ...subStyle, size: s })}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <div className="mh">Metin Rengi</div>
              <div className="row">
                {[['#ffffff', 'Beyaz'], ['#ffeb3b', 'Sarı'], ['#00e5ff', 'Mavi'], ['#76ff03', 'Yeşil']].map(([c, n]) => (
                  <button
                    key={c}
                    className={subStyle.color === c ? 'on' : ''}
                    onClick={() => setSubStyle({ ...subStyle, color: c })}
                    style={{ color: c }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="mh">Senkron Kaydırma (±5 sn)</div>
              <div className="row">
                <button onClick={() => {
                  const o = +(subStyle.offset - 0.5).toFixed(1);
                  setSubStyle({ ...subStyle, offset: o });
                  flash(`Altyazı: ${o > 0 ? '+' : ''}${o} sn`);
                }}>-0.5s</button>
                <button onClick={() => {
                  setSubStyle({ ...subStyle, offset: 0 });
                  flash('Altyazı senkronu sıfırlandı');
                }}>0s</button>
                <button onClick={() => {
                  const o = +(subStyle.offset + 0.5).toFixed(1);
                  setSubStyle({ ...subStyle, offset: o });
                  flash(`Altyazı: ${o > 0 ? '+' : ''}${o} sn`);
                }}>+0.5s</button>
              </div>
            </>
          )}

          {menu === 'source' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Yayın Kaynağı</div>
              {sources.map((s, i) => (
                <button
                  key={i}
                  className={i === activeSource ? 'on' : ''}
                  onClick={() => {
                    onSourceChange?.(i);
                    setMenu(null);
                  }}
                >
                  {s.lang ? `[${s.lang}] ` : ''}{s.name}
                </button>
              ))}
            </>
          )}

          {menu === 'key_input' && (
            <div className="key-box">
              <div className="mh" onClick={() => setMenu('settings')}>‹ Key & Özel Akış Girişi</div>
              <p className="hint">
                Cloudflare / Geo engeli veya şifreli yayınlar için <b>ZenRows / ScraperAPI anahtarınızı</b> veya doğrudan <b>M3U8 bağlantınızı</b> buraya girebilirsiniz:
              </p>
              
              <label>API Key (ZenRows / ScraperAPI / AES Key):</label>
              <input
                type="text"
                placeholder="Örn: zr_abc123 veya api_key..."
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
              />

              <label>Doğrudan M3U8 / MP4 Yayını:</label>
              <input
                type="text"
                placeholder="https://domain.com/stream.m3u8"
                value={customStreamUrl}
                onChange={(e) => setCustomStreamUrl(e.target.value)}
              />

              <div className="btn-group">
                <button
                  className="btn-save"
                  onClick={() => {
                    if (onKeyChange) onKeyChange(customKeyInput);
                    if (customStreamUrl && onCustomStream) onCustomStream(customStreamUrl);
                    localStorage.setItem('hdfc_user_key', customKeyInput);
                    flash('✅ Anahtar kaydedildi ve yayına uygulandı');
                    setMenu(null);
                  }}
                >
                  Uygula & Oynat
                </button>
                <button
                  onClick={() => {
                    setCustomKeyInput('');
                    setCustomStreamUrl('');
                    localStorage.removeItem('hdfc_user_key');
                    if (onKeyChange) onKeyChange('');
                    flash('Anahtarlar temizlendi');
                  }}
                >
                  Temizle
                </button>
              </div>
            </div>
          )}

          {menu === 'sleep' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Uyku Zamanlayıcı</div>
              <button
                className={!sleepAt ? 'on' : ''}
                onClick={() => {
                  setSleepAt(null);
                  setMenu(null);
                  flash('Uyku zamanlayıcı kapatıldı');
                }}
              >
                Kapalı
              </button>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setSleepAt(Date.now() + m * 60000);
                    flash(`😴 Film ${m} dakika sonra durdurulacak`);
                    setMenu(null);
                  }}
                >
                  {m} dakika sonra durdur
                </button>
              ))}
            </>
          )}

          {menu === 'stats' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Yayın İstatistikleri (Stats)</div>
              <div className="stat"><b>Çözünürlük:</b> {videoRef.current?.videoWidth || 0} × {videoRef.current?.videoHeight || 0}</div>
              <div className="stat"><b>Aktif Seviye:</b> {stats.level || 'Otomatik'}</div>
              <div className="stat"><b>Bant Genişliği:</b> {stats.bw || '-'}</div>
              <div className="stat"><b>Tampon Durumu:</b> {Math.max(0, (buffered - current)).toFixed(1)} sn</div>
              <div className="stat"><b>Kayıp Kareler:</b> {stats.dropped ?? 0}</div>
              <div className="stat"><b>Mevcut Kaynak:</b> {sources[activeSource]?.name || 'HLS Master'}</div>
            </>
          )}

          {menu === 'keys' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Klavye Kısayolları</div>
              {[
                ['Boşluk / K', 'Oynat / Duraklat'],
                ['Sol / Sağ Ok', '10 sn Geri / İleri'],
                ['J / L', '10 sn Atlama'],
                ['Yukarı / Aşağı', 'Ses Artır / Azalt'],
                ['0 - 9', 'Yüzdelik Konuma Atla'],
                ['M', 'Sesi Kapat / Aç'],
                ['F', 'Tam Ekran'],
                ['T', 'Sinema Modu'],
                ['P', 'Resim İçinde Resim (PiP)'],
                ['C', 'Altyazıyı Aç / Kapat'],
                ['S', 'Ekran Görüntüsü Al (PNG)'],
                ['A', 'A-B Tekrar Noktası Koy'],
                ['I', 'Yayın İstatistikleri'],
                ['< / >', 'Hızı Artır / Azalt'],
              ].map(([k, d]) => (
                <div className="stat" key={k}>
                  <b>{k}</b> {d}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .player {
          position: relative;
          background: #000;
          width: 100%;
          height: 100%;
          aspect-ratio: 16/9;
          max-height: 100vh;
          overflow: hidden;
          user-select: none;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #fff;
          border-radius: 8px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        }
        .player.fs {
          aspect-ratio: auto;
          height: 100vh;
          border-radius: 0;
        }
        .player.theater {
          max-height: 85vh;
          aspect-ratio: 21/9;
        }
        video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          background: #000;
        }
        video::cue {
          font-size: var(--sub-size);
          color: var(--sub-color);
          background: var(--sub-bg);
          text-shadow: 0 2px 4px #000, 0 0 8px #000;
          line-height: 1.4;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .noui {
          cursor: none;
        }
        .top, .bottom {
          position: absolute;
          left: 0;
          right: 0;
          transition: opacity 0.3s ease, transform 0.3s ease;
          z-index: 10;
        }
        .top {
          top: 0;
          padding: 16px 20px;
          background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 100%);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .ttl {
          font-weight: 700;
          font-size: 16px;
          letter-spacing: 0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .top-badges {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-shrink: 0;
        }
        .badge {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 99px;
          font-weight: 700;
        }
        .badge.loop { background: #ffd400; color: #000; }
        .badge.sleep { background: #673ab7; color: #fff; }
        .badge.rate { background: #00e5ff; color: #000; }
        .badge.src-badge { background: #e50914; color: #fff; }

        .bottom {
          bottom: 0;
          padding: 0 16px 14px;
          background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, transparent 100%);
        }
        .noui .top { opacity: 0; transform: translateY(-12px); pointer-events: none; }
        .noui .bottom { opacity: 0; transform: translateY(12px); pointer-events: none; }

        .seek {
          position: relative;
          height: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          margin: 0 4px 6px;
        }
        .seek::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          height: 5px;
          background: rgba(255, 255, 255, 0.25);
          border-radius: 3px;
          transition: height 0.15s;
        }
        .seek:hover::before {
          height: 8px;
        }
        .buf, .prog {
          position: absolute;
          left: 0;
          height: 5px;
          border-radius: 3px;
          transition: height 0.15s;
        }
        .seek:hover .buf, .seek:hover .prog {
          height: 8px;
        }
        .buf { background: rgba(255, 255, 255, 0.45); }
        .prog { background: #e50914; }
        .prog::after {
          content: '';
          position: absolute;
          right: -7px;
          top: 50%;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #e50914;
          box-shadow: 0 0 10px rgba(229,9,20,0.8);
          transform: translateY(-50%) scale(0);
          transition: transform 0.15s;
        }
        .seek:hover .prog::after {
          transform: translateY(-50%) scale(1);
        }
        .mark {
          position: absolute;
          top: 0;
          width: 3px;
          height: 100%;
          background: #ffd400;
          z-index: 2;
        }
        .hover-tip {
          position: absolute;
          bottom: 22px;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.85);
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 6px;
          border-radius: 4px;
          pointer-events: none;
          white-space: nowrap;
        }

        .ctl {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }
        .ctl button {
          background: none;
          border: 0;
          color: #fff;
          font-size: 16px;
          padding: 8px 10px;
          cursor: pointer;
          border-radius: 6px;
          line-height: 1;
          font-weight: 700;
          transition: background 0.15s, color 0.15s;
        }
        .ctl button:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .ctl button.btn-play {
          font-size: 20px;
        }
        .ctl button.on {
          color: #e50914;
        }
        .ctl button.dis {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .vol-wrap {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .vol {
          width: 75px;
          accent-color: #e50914;
          cursor: pointer;
        }
        .time {
          font-size: 13px;
          font-variant-numeric: tabular-nums;
          margin-left: 8px;
          color: #ddd;
        }
        .grow {
          flex: 1;
        }

        .spinner-wrap {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: rgba(0,0,0,0.4);
          pointer-events: none;
        }
        .spinner {
          width: 54px;
          height: 54px;
          border: 4px solid rgba(255, 255, 255, 0.25);
          border-top-color: #e50914;
          border-radius: 50%;
          animation: sp 0.75s linear infinite;
        }
        @keyframes sp {
          to { transform: rotate(360deg); }
        }

        .toast {
          position: absolute;
          left: 50%;
          top: 15%;
          transform: translateX(-50%);
          background: rgba(15, 15, 15, 0.92);
          border: 1px solid rgba(255,255,255,0.15);
          padding: 9px 18px;
          border-radius: 99px;
          font-size: 14px;
          font-weight: 600;
          pointer-events: none;
          backdrop-filter: blur(8px);
          box-shadow: 0 8px 30px rgba(0,0,0,0.6);
          z-index: 30;
        }

        .err {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: rgba(10, 10, 10, 0.94);
          padding: 24px;
          text-align: center;
          z-index: 25;
        }
        .err-icon {
          font-size: 40px;
        }
        .err-title {
          font-size: 17px;
          font-weight: 700;
          color: #ff8a80;
        }
        .err-sub {
          font-size: 13px;
          color: #aaa;
          max-width: 480px;
          margin: 0;
        }
        .err-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-top: 6px;
        }
        .err-src {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .err-src button, .btn-key {
          background: #e50914;
          border: 0;
          color: #fff;
          padding: 9px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          transition: background 0.15s;
        }
        .err-src button.on {
          background: #fff;
          color: #000;
        }
        .btn-key {
          background: #2a2a2a;
          border: 1px solid #444;
        }
        .btn-key:hover {
          background: #3a3a3a;
        }

        .menu {
          position: absolute;
          right: 16px;
          bottom: 64px;
          width: min(320px, 92%);
          max-height: 75%;
          overflow-y: auto;
          background: rgba(18, 18, 18, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          padding: 8px;
          backdrop-filter: blur(12px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.9);
          z-index: 40;
        }
        .menu button {
          display: flex;
          justify-content: space-between;
          width: 100%;
          background: none;
          border: 0;
          color: #eee;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13.5px;
          text-align: left;
          transition: background 0.12s;
        }
        .menu button:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .menu button.on {
          color: #e50914;
          font-weight: 700;
        }
        .menu button span {
          opacity: 0.65;
          font-size: 12.5px;
        }
        .mh {
          padding: 8px 12px 4px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0.6;
          cursor: pointer;
        }
        .row {
          display: flex;
          gap: 6px;
          padding: 4px 8px 8px;
        }
        .row button {
          justify-content: center;
          background: rgba(255,255,255,0.08);
          padding: 8px;
        }
        .stat {
          padding: 7px 12px;
          font-size: 13px;
          opacity: 0.9;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .stat b {
          display: inline-block;
          min-width: 110px;
          color: #ffb300;
        }

        .key-box {
          padding: 6px;
        }
        .key-box .hint {
          font-size: 12px;
          color: #aaa;
          line-height: 1.45;
          margin: 4px 0 10px;
        }
        .key-box label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #ddd;
          margin: 8px 0 4px;
        }
        .key-box input {
          width: 100%;
          box-sizing: border-box;
          background: #111;
          border: 1px solid #444;
          color: #fff;
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 13px;
          outline: none;
        }
        .key-box input:focus {
          border-color: #e50914;
        }
        .btn-group {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .btn-save {
          background: #e50914 !important;
          color: #fff !important;
          font-weight: 700;
        }

        @media (max-width: 680px) {
          .vol-wrap { display: none; }
          .time { font-size: 11.5px; }
          .ctl button { font-size: 14px; padding: 6px 8px; }
        }
      `}</style>
    </div>
  );
}

function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
