'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Özel HLS oynatıcı
 * Özellikler: kalite/ses/altyazı seçimi, hız, ±10sn, klavye kısayolları, PiP,
 * tam ekran, ses/ışık kaydırma, kaldığı yerden devam, ekran görüntüsü, kaynak değiştirme,
 * uyku zamanlayıcı, döngü/A-B tekrar, istatistik paneli.
 */
export default function HlsPlayer({ src, subtitles = [], poster, title, storageKey, sources = [], activeSource = 0, onSourceChange, onError }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimer = useRef(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioTrack, setAudioTrack] = useState(-1);
  const [subTracks, setSubTracks] = useState([]);
  const [subTrack, setSubTrack] = useState(-1);
  const [showUi, setShowUi] = useState(true);
  const [menu, setMenu] = useState(null); // 'settings' | 'quality' | 'audio' | 'subs' | 'speed' | 'source' | 'sleep' | 'stats'
  const [fs, setFs] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});
  const [loopAB, setLoopAB] = useState({ a: null, b: null });
  const [sleepAt, setSleepAt] = useState(null);
  const [toast, setToast] = useState(null);
  const [subStyle, setSubStyle] = useState({ size: 1, bg: true });

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setToast(null), 1200);
  }, []);

  /* ── HLS kurulum ─────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let hls;
    let destroyed = false;
    setReady(false); setError(null); setLevels([]); setAudioTracks([]); setSubTracks([]);

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
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
          startLevel: -1,
          capLevelToPlayerSize: false,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setLevels(data.levels.map((l, i) => ({ i, h: l.height, w: l.width, br: l.bitrate, name: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps` })));
          setAudioTracks(hls.audioTracks.map((t, i) => ({ i, name: t.name || t.lang || `Ses ${i + 1}`, lang: t.lang })));
          setAudioTrack(hls.audioTrack);
          setSubTracks(hls.subtitleTracks.map((t, i) => ({ i, name: t.name || t.lang || `Altyazı ${i + 1}` })));
          setReady(true);
          const saved = storageKey && parseFloat(localStorage.getItem('pos:' + storageKey) || '0');
          if (saved && saved > 10 && saved < (video.duration || Infinity) - 30) {
            video.currentTime = saved;
            flash(`▶ ${fmt(saved)} konumundan devam ediliyor`);
          }
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setLevel(hls.autoLevelEnabled ? -1 : d.level));
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudioTracks(hls.audioTracks.map((t, i) => ({ i, name: t.name || t.lang || `Ses ${i + 1}`, lang: t.lang }))));
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setAudioTrack(d.id));
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setSubTracks(hls.subtitleTracks.map((t, i) => ({ i, name: t.name || t.lang || `Altyazı ${i + 1}` }))));
        hls.on(Hls.Events.FRAG_BUFFERED, (_, d) => {
          const lvl = hls.levels[hls.currentLevel];
          setStats((s) => ({ ...s, level: lvl ? `${lvl.height}p @ ${Math.round(lvl.bitrate / 1000)} kbps` : '-', bw: `${(hls.bandwidthEstimate / 1e6).toFixed(2)} Mbps`, frag: d.frag.sn, dropped: video.getVideoPlaybackQuality?.().droppedVideoFrames }));
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (data.details === 'manifestLoadError' || data.details === 'manifestParsingError') {
              setError('Yayın alınamadı (kaynak engelli veya süresi dolmuş). Başka kaynak deneyin.');
              onError?.(data);
            } else { flash('Ağ hatası, yeniden deneniyor…'); hls.startLoad(); }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            flash('Medya hatası, kurtarılıyor…'); hls.recoverMediaError();
          } else { setError('Oynatma hatası: ' + data.details); onError?.(data); }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src; setReady(true);
        video.play().catch(() => {});
      } else {
        setError('Tarayıcınız HLS oynatmayı desteklemiyor.');
      }
    })();

    return () => { destroyed = true; hls?.destroy(); hlsRef.current = null; };
  }, [src]); // eslint-disable-line

  /* ── video olayları ──────────────────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrent(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      if (loopAB.a != null && loopAB.b != null && v.currentTime >= loopAB.b) v.currentTime = loopAB.a;
      if (storageKey && Math.floor(v.currentTime) % 5 === 0) localStorage.setItem('pos:' + storageKey, String(v.currentTime));
      if (sleepAt && Date.now() >= sleepAt) { v.pause(); setSleepAt(null); flash('😴 Uyku zamanlayıcı: durduruldu'); }
    };
    const evs = {
      timeupdate: onTime,
      durationchange: () => setDuration(v.duration || 0),
      play: () => setPlaying(true), pause: () => setPlaying(false),
      waiting: () => setBuffering(true), playing: () => setBuffering(false), canplay: () => setBuffering(false),
      volumechange: () => { setVolume(v.volume); setMuted(v.muted); },
      ratechange: () => setRate(v.playbackRate),
      ended: () => { if (storageKey) localStorage.removeItem('pos:' + storageKey); },
    };
    Object.entries(evs).forEach(([k, f]) => v.addEventListener(k, f));
    return () => Object.entries(evs).forEach(([k, f]) => v.removeEventListener(k, f));
  }, [loopAB, sleepAt, storageKey, flash]);

  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  /* ── kontroller ──────────────────────────────────────────── */
  const v = () => videoRef.current;
  const togglePlay = useCallback(() => { const x = v(); if (!x) return; x.paused ? x.play() : x.pause(); }, []);
  const seek = useCallback((d) => { const x = v(); if (!x) return; x.currentTime = Math.max(0, Math.min((x.duration || 0), x.currentTime + d)); flash(`${d > 0 ? '⏩' : '⏪'} ${Math.abs(d)} sn`); }, [flash]);
  const setVol = useCallback((val) => { const x = v(); if (!x) return; x.volume = Math.max(0, Math.min(1, val)); x.muted = x.volume === 0; flash(`🔊 ${Math.round(x.volume * 100)}%`); }, [flash]);
  const toggleMute = useCallback(() => { const x = v(); if (x) { x.muted = !x.muted; flash(x.muted ? '🔇 Sessiz' : '🔊 Ses açık'); } }, [flash]);
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {}));
  }, []);
  const togglePip = useCallback(async () => {
    const x = v(); if (!x) return;
    try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await x.requestPictureInPicture(); } catch { flash('PiP desteklenmiyor'); }
  }, [flash]);
  const changeRate = useCallback((r) => { const x = v(); if (x) { x.playbackRate = r; flash(`⚡ ${r}x`); } }, [flash]);
  const changeLevel = (i) => { const h = hlsRef.current; if (!h) return; h.currentLevel = i; setLevel(i); flash(i === -1 ? 'Otomatik kalite' : levels.find((l) => l.i === i)?.name); setMenu(null); };
  const changeAudio = (i) => { const h = hlsRef.current; if (!h) return; h.audioTrack = i; setAudioTrack(i); setMenu(null); };
  const changeSub = (i) => {
    const x = v(); if (!x) return;
    const h = hlsRef.current;
    if (h) h.subtitleTrack = -1;
    Array.from(x.textTracks).forEach((t, idx) => { t.mode = idx === i ? 'showing' : 'disabled'; });
    setSubTrack(i); setMenu(null);
    flash(i === -1 ? 'Altyazı kapalı' : 'Altyazı açık');
  };
  const screenshot = useCallback(() => {
    const x = v(); if (!x) return;
    try {
      const c = document.createElement('canvas'); c.width = x.videoWidth; c.height = x.videoHeight;
      c.getContext('2d').drawImage(x, 0, 0);
      const a = document.createElement('a'); a.download = `${(title || 'kare').replace(/[^\w\-]+/g, '_')}_${fmt(x.currentTime).replace(/:/g, '-')}.png`; a.href = c.toDataURL('image/png'); a.click();
      flash('📸 Ekran görüntüsü alındı');
    } catch { flash('Ekran görüntüsü alınamadı (CORS)'); }
  }, [title, flash]);
  const markAB = () => {
    const x = v(); if (!x) return;
    if (loopAB.a == null) { setLoopAB({ a: x.currentTime, b: null }); flash('A noktası ayarlandı'); }
    else if (loopAB.b == null) { setLoopAB({ a: loopAB.a, b: x.currentTime }); flash('A‑B döngü aktif'); }
    else { setLoopAB({ a: null, b: null }); flash('Döngü kapatıldı'); }
  };

  /* ── klavye ──────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const x = v(); if (!x) return;
      const map = {
        ' ': togglePlay, k: togglePlay,
        ArrowRight: () => seek(10), ArrowLeft: () => seek(-10), l: () => seek(10), j: () => seek(-10),
        ArrowUp: () => setVol(x.volume + 0.1), ArrowDown: () => setVol(x.volume - 0.1),
        m: toggleMute, f: toggleFs, p: togglePip, s: screenshot, a: markAB,
        '>': () => changeRate(Math.min(4, +(x.playbackRate + 0.25).toFixed(2))),
        '<': () => changeRate(Math.max(0.25, +(x.playbackRate - 0.25).toFixed(2))),
        c: () => changeSub(subTrack === -1 ? 0 : -1),
        Escape: () => setMenu(null),
      };
      if (/^[0-9]$/.test(e.key)) { x.currentTime = (x.duration || 0) * (+e.key / 10); return; }
      const fn = map[e.key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, setVol, toggleMute, toggleFs, togglePip, screenshot, changeRate, subTrack]); // eslint-disable-line

  /* ── UI gizleme ──────────────────────────────────────────── */
  const poke = () => {
    setShowUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (!menu && videoRef.current && !videoRef.current.paused) setShowUi(false); }, 2800);
  };
  useEffect(() => { poke(); return () => clearTimeout(hideTimer.current); }, [menu]); // eslint-disable-line

  /* ── dokunma: çift dokunma ile atla ──────────────────────── */
  const lastTap = useRef({ t: 0, x: 0 });
  const onTap = (e) => {
    const now = Date.now();
    const rect = wrapRef.current.getBoundingClientRect();
    const x = (e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left;
    if (now - lastTap.current.t < 300) {
      if (x < rect.width / 3) seek(-10); else if (x > (rect.width * 2) / 3) seek(10); else toggleFs();
      lastTap.current.t = 0;
    } else { lastTap.current = { t: now, x }; setTimeout(() => { if (lastTap.current.t === now) togglePlay(); }, 300); }
  };

  const onSeekBar = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const x = v(); if (x && duration) x.currentTime = p * duration;
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const bpct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div ref={wrapRef} className={`player ${showUi ? 'ui' : 'noui'} ${fs ? 'fs' : ''}`} onMouseMove={poke} onTouchStart={poke}
      style={{ '--sub-size': `${subStyle.size * 1.15}em`, '--sub-bg': subStyle.bg ? 'rgba(0,0,0,.75)' : 'transparent' }}>
      <video ref={videoRef} poster={poster} playsInline crossOrigin="anonymous" preload="auto" onClick={onTap} onTouchEnd={(e) => { e.preventDefault(); onTap(e); }}>
        {subtitles.map((s, i) => (
          <track key={i} kind="subtitles" src={s.proxyUrl || s.url} label={s.label} srcLang={s.lang || 'tr'} />
        ))}
      </video>

      {(buffering && !error) && <div className="spinner" />}
      {toast && <div className="toast">{toast}</div>}
      {error && (
        <div className="err">
          <div>⚠️ {error}</div>
          {sources.length > 1 && (
            <div className="err-src">{sources.map((s, i) => (
              <button key={i} disabled={i === activeSource} onClick={() => onSourceChange?.(i)}>{s.lang ? `[${s.lang}] ` : ''}{s.name}</button>
            ))}</div>
          )}
        </div>
      )}

      <div className="top">
        <div className="ttl">{title}</div>
        {loopAB.a != null && <span className="badge">A{loopAB.b != null ? '‑B' : ''} döngü</span>}
        {sleepAt && <span className="badge">😴 {Math.max(0, Math.round((sleepAt - Date.now()) / 60000))} dk</span>}
        {rate !== 1 && <span className="badge">{rate}x</span>}
      </div>

      <div className="bottom">
        <div className="seek" onClick={onSeekBar}>
          <div className="buf" style={{ width: `${bpct}%` }} />
          <div className="prog" style={{ width: `${pct}%` }} />
          {loopAB.a != null && duration > 0 && <div className="mark" style={{ left: `${(loopAB.a / duration) * 100}%` }} />}
          {loopAB.b != null && duration > 0 && <div className="mark" style={{ left: `${(loopAB.b / duration) * 100}%` }} />}
        </div>
        <div className="ctl">
          <button onClick={togglePlay} title="Oynat/Duraklat (k)">{playing ? '⏸' : '▶'}</button>
          <button onClick={() => seek(-10)} title="10 sn geri (j)">↺10</button>
          <button onClick={() => seek(10)} title="10 sn ileri (l)">↻10</button>
          <button onClick={toggleMute} title="Sessiz (m)">{muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</button>
          <input className="vol" type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume} onChange={(e) => setVol(+e.target.value)} />
          <span className="time">{fmt(current)} / {fmt(duration)}</span>
          <div className="grow" />
          {subtitles.length + subTracks.length > 0 && <button className={subTrack >= 0 ? 'on' : ''} onClick={() => setMenu(menu === 'subs' ? null : 'subs')} title="Altyazı (c)">CC</button>}
          {audioTracks.length > 1 && <button onClick={() => setMenu(menu === 'audio' ? null : 'audio')} title="Ses parçası">🎧</button>}
          {levels.length > 1 && <button onClick={() => setMenu(menu === 'quality' ? null : 'quality')} title="Kalite">{level === -1 ? 'AUTO' : levels.find((l) => l.i === level)?.name}</button>}
          {sources.length > 1 && <button onClick={() => setMenu(menu === 'source' ? null : 'source')} title="Kaynak">📡</button>}
          <button onClick={() => setMenu(menu === 'settings' ? null : 'settings')} title="Ayarlar">⚙️</button>
          <button onClick={togglePip} title="Resim içinde resim (p)">⧉</button>
          <button onClick={toggleFs} title="Tam ekran (f)">{fs ? '🡼' : '⛶'}</button>
        </div>
      </div>

      {menu && (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          {menu === 'settings' && (
            <>
              <div className="mh">Ayarlar</div>
              <button onClick={() => setMenu('speed')}>⚡ Hız <span>{rate}x ›</span></button>
              {levels.length > 1 && <button onClick={() => setMenu('quality')}>📺 Kalite <span>{level === -1 ? 'Otomatik' : levels.find((l) => l.i === level)?.name} ›</span></button>}
              {audioTracks.length > 1 && <button onClick={() => setMenu('audio')}>🎧 Ses <span>{audioTracks.find((t) => t.i === audioTrack)?.name || '-'} ›</span></button>}
              {(subtitles.length + subTracks.length) > 0 && <button onClick={() => setMenu('subs')}>💬 Altyazı <span>{subTrack === -1 ? 'Kapalı' : 'Açık'} ›</span></button>}
              {sources.length > 1 && <button onClick={() => setMenu('source')}>📡 Kaynak <span>{sources[activeSource]?.name} ›</span></button>}
              <button onClick={() => setMenu('sleep')}>😴 Uyku zamanlayıcı <span>{sleepAt ? 'Açık' : 'Kapalı'} ›</span></button>
              <button onClick={() => { markAB(); }}>🔁 A‑B döngü <span>{loopAB.a == null ? 'A ayarla' : loopAB.b == null ? 'B ayarla' : 'Kapat'}</span></button>
              <button onClick={screenshot}>📸 Ekran görüntüsü <span>s</span></button>
              <button onClick={() => setMenu('stats')}>📊 İstatistikler <span>›</span></button>
              <button onClick={() => setMenu('keys')}>⌨️ Kısayollar <span>›</span></button>
            </>
          )}
          {menu === 'speed' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Hız</div>
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map((r) => <button key={r} className={r === rate ? 'on' : ''} onClick={() => { changeRate(r); setMenu(null); }}>{r}x</button>)}
            </>
          )}
          {menu === 'quality' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Kalite</div>
              <button className={level === -1 ? 'on' : ''} onClick={() => changeLevel(-1)}>Otomatik</button>
              {[...levels].sort((a, b) => (b.h || b.br) - (a.h || a.br)).map((l) => <button key={l.i} className={l.i === level ? 'on' : ''} onClick={() => changeLevel(l.i)}>{l.name} <span>{Math.round(l.br / 1000)} kbps</span></button>)}
            </>
          )}
          {menu === 'audio' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Ses parçası</div>
              {audioTracks.map((t) => <button key={t.i} className={t.i === audioTrack ? 'on' : ''} onClick={() => changeAudio(t.i)}>{t.name}</button>)}
            </>
          )}
          {menu === 'subs' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Altyazı</div>
              <button className={subTrack === -1 ? 'on' : ''} onClick={() => changeSub(-1)}>Kapalı</button>
              {Array.from(videoRef.current?.textTracks || []).map((t, i) => <button key={i} className={subTrack === i ? 'on' : ''} onClick={() => changeSub(i)}>{t.label || t.language || `Altyazı ${i + 1}`}</button>)}
              <div className="mh">Boyut</div>
              <div className="row">{[0.8, 1, 1.25, 1.5].map((s) => <button key={s} className={subStyle.size === s ? 'on' : ''} onClick={() => setSubStyle({ ...subStyle, size: s })}>{s}x</button>)}</div>
              <button onClick={() => setSubStyle({ ...subStyle, bg: !subStyle.bg })}>Arka plan <span>{subStyle.bg ? 'Açık' : 'Kapalı'}</span></button>
            </>
          )}
          {menu === 'source' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Kaynak</div>
              {sources.map((s, i) => <button key={i} className={i === activeSource ? 'on' : ''} onClick={() => { onSourceChange?.(i); setMenu(null); }}>{s.lang ? `[${s.lang}] ` : ''}{s.name}</button>)}
            </>
          )}
          {menu === 'sleep' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Uyku zamanlayıcı</div>
              <button className={!sleepAt ? 'on' : ''} onClick={() => { setSleepAt(null); setMenu(null); }}>Kapalı</button>
              {[15, 30, 45, 60, 90].map((m) => <button key={m} onClick={() => { setSleepAt(Date.now() + m * 60000); flash(`😴 ${m} dk sonra durur`); setMenu(null); }}>{m} dakika</button>)}
            </>
          )}
          {menu === 'stats' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ İstatistikler</div>
              <div className="stat">Çözünürlük: {videoRef.current?.videoWidth}×{videoRef.current?.videoHeight}</div>
              <div className="stat">Seviye: {stats.level || '-'}</div>
              <div className="stat">Bant genişliği: {stats.bw || '-'}</div>
              <div className="stat">Parça: {stats.frag ?? '-'}</div>
              <div className="stat">Düşen kare: {stats.dropped ?? '-'}</div>
              <div className="stat">Tampon: {(buffered - current).toFixed(1)} sn</div>
            </>
          )}
          {menu === 'keys' && (
            <>
              <div className="mh" onClick={() => setMenu('settings')}>‹ Kısayollar</div>
              {[['Boşluk / K', 'Oynat‑Duraklat'], ['← → / J L', '10 sn'], ['↑ ↓', 'Ses'], ['0‑9', 'Yüzde atla'], ['M', 'Sessiz'], ['F', 'Tam ekran'], ['P', 'PiP'], ['C', 'Altyazı'], ['S', 'Ekran görüntüsü'], ['A', 'A‑B döngü'], ['< >', 'Hız']].map(([k, d]) => <div className="stat" key={k}><b>{k}</b> {d}</div>)}
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .player{position:relative;background:#000;width:100%;height:100%;aspect-ratio:16/9;max-height:100vh;overflow:hidden;user-select:none;font-family:system-ui,sans-serif;color:#fff}
        .player.fs{aspect-ratio:auto;height:100vh}
        video{width:100%;height:100%;display:block;object-fit:contain;background:#000}
        video::cue{font-size:var(--sub-size);background:var(--sub-bg);color:#fff;text-shadow:0 1px 3px #000}
        .noui{cursor:none}
        .top,.bottom{position:absolute;left:0;right:0;transition:opacity .25s,transform .25s}
        .top{top:0;padding:14px 16px;background:linear-gradient(#000c,transparent);display:flex;gap:8px;align-items:center}
        .ttl{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .badge{background:#e50914;font-size:11px;padding:2px 7px;border-radius:99px;font-weight:700}
        .bottom{bottom:0;padding:0 12px 10px;background:linear-gradient(transparent,#000d)}
        .noui .top{opacity:0;transform:translateY(-8px)} .noui .bottom{opacity:0;transform:translateY(8px)}
        .seek{position:relative;height:14px;cursor:pointer;display:flex;align-items:center;margin:0 4px}
        .seek::before{content:'';position:absolute;left:0;right:0;height:4px;background:#ffffff33;border-radius:2px}
        .seek:hover::before{height:6px}
        .buf,.prog{position:absolute;left:0;height:4px;border-radius:2px}
        .seek:hover .buf,.seek:hover .prog{height:6px}
        .buf{background:#ffffff66} .prog{background:#e50914}
        .prog::after{content:'';position:absolute;right:-6px;top:50%;width:13px;height:13px;border-radius:50%;background:#e50914;transform:translateY(-50%) scale(0);transition:transform .15s}
        .seek:hover .prog::after{transform:translateY(-50%) scale(1)}
        .mark{position:absolute;top:0;width:2px;height:100%;background:#ffd400}
        .ctl{display:flex;align-items:center;gap:2px;margin-top:2px;flex-wrap:wrap}
        .ctl button{background:none;border:0;color:#fff;font-size:17px;padding:8px 9px;cursor:pointer;border-radius:6px;line-height:1;font-weight:700}
        .ctl button:hover{background:#ffffff22}
        .ctl button.on{color:#e50914}
        .vol{width:80px;accent-color:#e50914;cursor:pointer}
        .time{font-size:12.5px;font-variant-numeric:tabular-nums;margin-left:6px;opacity:.9}
        .grow{flex:1}
        .spinner{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px;border:4px solid #ffffff33;border-top-color:#e50914;border-radius:50%;animation:sp .8s linear infinite;pointer-events:none}
        @keyframes sp{to{transform:rotate(360deg)}}
        .toast{position:absolute;left:50%;top:18%;transform:translateX(-50%);background:#000c;padding:8px 16px;border-radius:99px;font-size:14px;font-weight:600;pointer-events:none}
        .err{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000c;padding:20px;text-align:center;font-size:15px}
        .err-src{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
        .err-src button{background:#e50914;border:0;color:#fff;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600}
        .err-src button:disabled{opacity:.4}
        .menu{position:absolute;right:12px;bottom:64px;width:min(280px,90%);max-height:70%;overflow:auto;background:#141414f2;border:1px solid #ffffff1a;border-radius:10px;padding:6px;backdrop-filter:blur(8px);box-shadow:0 10px 40px #000a}
        .menu button{display:flex;justify-content:space-between;width:100%;background:none;border:0;color:#fff;padding:10px 12px;border-radius:6px;cursor:pointer;font-size:14px;text-align:left}
        .menu button:hover{background:#ffffff14}
        .menu button.on{color:#e50914;font-weight:700}
        .menu button span{opacity:.6;font-size:13px}
        .mh{padding:8px 12px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.6;cursor:pointer}
        .row{display:flex;gap:4px;padding:0 6px} .row button{justify-content:center}
        .stat{padding:6px 12px;font-size:13px;opacity:.85} .stat b{display:inline-block;min-width:90px;color:#e50914}
        @media (max-width:600px){.vol{display:none}.time{font-size:11px}.ctl button{font-size:15px;padding:7px}}
      `}</style>
    </div>
  );
}

function fmt(s) {
  if (!isFinite(s)) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
