# HDFilmCehennemi – Film Botu & HLS Player (V3.0 TV)

CloudStream uzantısının **"kalbi"** ([hexated/Hdfilmcehennemi](https://github.com/hexated/cloudstream-extensions-hexated)) tam entegre edilmiş; film kartları, kategori rafları, canlı arama ve **AES-128 anahtarlı m3u8** çözen özel HLS oynatıcıyla, **Vestel/Android TV uzaktan kumanda dostu** arayüzde birleştirilmiş tam teşkilatlı film sitesi.

---

## 🎮 TV / Uzaktan Kumanda Deneyimi (Vestel Stili)

Arayüz, TV'de yayınlamış olduğumuz sürümün davranış modeline göre tasarlandı:

- **← → ↑ ↓** : Kartlar ve butonlar arasında gezinme. Yatayda aynı görsel çizgide ilerler; dikeyde en yakın X merkezine atlar (2D grid desteği).
- **OK / Enter** : Odaktaki kartı/butonları tetikler.
- **ESC** : Modal kapat → arama temizle → sekme değiştir → kataloğa dön (kademeli geri).
- **Oynatıcıda** : Odak oynatıcı sahnesindeyken oklar **seek/vol**'a devredilir (player kısayolları); **↑** ile kaynağa geri dönülür. "▶ Oynatıcı" butonu odağı sahneye atar.
- Oda ringi: kırmızı glow + zoom; oda dışı kartlar hafif karartılır (gerçek TV hissi).
- Fare/klavye (Tab) ve dokunmatik de aynı akışta çalışır — tek kod tabanı.

Çekirdek: `components/TvNav.js` (`data-stage` → `data-row` → `data-fn` odak modeli; sahte DOM ile unit-test edilmiş).

---

## 🫀 CloudStream Çekirdeği (Kotlin → JS Bütün Entegrasyon)

| Uzantıdaki mekanizma | Bu repoda karşılığı |
|---|---|
| `mainPageOf` listeleri (home, home-series, tavsiye, imdb7, mostLiked, mostCommented…) | `lib/hdfc.js → LISTS` + `GET /api/list?key=…` |
| `search` (`/search?q=` JSON sonuçları) | `GET /api/search?q=…` (canlı + yerel katalog) |
| `load` (başlık, afiş, türler, yıl, oyuncular, fragman, öneriler, bölümler) | `parseDetail` + `GET /api/detail?url=…` |
| `loadLinks` (`div.alternative-links` → `/video/{id}/` → iframe) | `getIframeForVideo` + `resolveEmbed` (rapidrame/mobi dallanmasıyla) |
| `invokeLocalSource` (`getAndUnpack` + `decryptLocalUrl`) | `unpack` + **`decryptLocalUrl`** (aşağı) + `resolveVideoFromScript` |
| `CloudflareKiller` interceptor | Çok stratejili `smartFetch`: direkt → mirror → ZenRows/ScraperAPI → Translate köprüsü → public proxy |
| `newSubtitleFile` (`tracks:` altyazıları) | `parseTracks` + `GET /api/subtitle` (SRT→VTT) |
| M3U8 + Referer/UA başlıklı oynatma | `GET /api/stream` (segment, AES-128 key, Range, CORS proxy) |

**`decryptLocalUrl` (yeni, birebir port):** Site, m3u8 URL'ini obfke script içinde `(["parça1","parça2",…])` + `dc_xxx` fonksiyonuyla saklar ve **algoritma sırasını döndürür**. Port, script'i okuyarak:

1. parts dizisini ve `magicNum % (i + magicOffset)` değerlerini çıkarır,
2. `atob` / `reverse` / `rot(N)` işlemlerini **script içindeki gerçek sırayla** toplar,
3. rot shift'ini script metninden türetir (`charCodeAt(0) + N` ya da `o - base ± N` → `(26-N)%26`),
4. modulo unmix ile gerçek URL'e ulaşır.

`resolveVideoFromScript` içinde **ilk strateji** olarak çalışır; sabit varyantlar (Aniyomi/Aralık 2025/Close/Rapidrame/legacy `dc_hello`) yedek olarak korunur. → `tests/hdfc.test.mjs` (5 codec testi).

---

## 📂 Sistematik Katalog (75+ içerik, otomatik kategorilendirme)

- `lib/catalog-data.js`: 75 kuratlı film/dizi (yabancı + yerli, Türkçe özet, IMDb, tür, yıl, dil).
- `autoCategorize()`: yıl kovası, IMDb bantları (7+/8-9/9+), türler, dil, yerli/yabancı, "Yeni Eklenenler" etiketleri otomatik üretilir → 55+ kategori.
- `public/movies.json`: `python3 scraper.py` çıktısı (canlı tarama) ile birleşir:
  - `GET /api/catalog` → scraper verisi + kuratlı katalog (ID bazında merge, kategori sayaçları yeniden hesap).
  - `node scripts/rebuild-catalog.mjs` → dosyayı yerinde yeniden derler (canlı siteye ulaşılamayan ortamlarda dahi zengin katalog korunur).
- **Afiş garantisi:** Gerçek TMDB afiş yoksa/yüklenemezse `lib/poster.js` markalı SVG afiş üretir (başlık, yıl, tür) — grid'de asla kırık kart kalmaz.
- `GET /api/list?key=…&page=…`: Siteden canlı raflar (LIVE_KEYS) + yerel katalog fallback'i.

---

## ▶️ Özel HLS Oynatıcı (`components/HlsPlayer.js`)

- Otomatik adaptif bitrate (Auto/1080p/720p/480p/360p) + anlık kbps göstergesi
- Çoklu ses (TR Dublaj / Orijinal), çoklu altyazı + **kendi SRT/VTT dosyayı yükleme**
- Altyazı stili (boyut/rengi), ±5 sn senkron, 0.25x–3x hız
- ±10/±30 sn sarma, theater modu, PiP, tam ekran (mobilde landscape kilidi)
- Ekran görüntüsü (PNG), A-B döngü, uyku zamanlayıcı (15–120 dk), kaldığı yerden devam
- Mobil jestler (parlaklık/ses kaydırma, çift dokunma), Stats paneli
- Klavye: Space/K, J/L, ←/→, ↑/↓, 0-9, M, F, P, C, S, A, T, I
- **TV ile uyum:** Odak `[data-fn]` UI elemanındayken tuşlar TV nav'a aittir; odağın oynatıcıda olduğu durumlarda player kısayolları devrededir.

`/api/stream` proxy'si: tüm m3u8 URI'lerini (segment, ses, **AES-128 key**, alt playlist) `Referer`/`Origin`/`User-Agent`/`Range` başlıklarıyla proxy'den geçirir; upstream ölürse yerel demo master playlist'e düşer (video asla bozulmaz).

---

## 🚀 Kurulum

```bash
npm install

# Kataloğu canlı siteden güncelle (isteğe bağlı; blokluysa yerleşik 75'lik katalog devrede)
python3 scraper.py
node scripts/rebuild-catalog.mjs

npm run dev        # http://localhost:3000  (0.0.0.0'a bağlanır)
npm run test:lib   # 28 test: codec, parser, proxy, TV navigasyon
```

İsteğe bağlı çevre değişkenleri: `HDFC_BASE`, `ZENROWS_API_KEY`, `SCRAPERAPI_KEY` (veya arayüzdeki 🔑 Key kutusu — tarayıcıda saklanır, sunucuya gitmez).

---

## 📡 API Uç Noktaları

| Uç Nokta | Açıklama |
|---|---|
| `GET /api/catalog` | Merge edilmiş tam katalog (movies + 55 kategori) |
| `GET /api/list?key=…&page=…` | Siteden canlı raf listesi (16 hazır key) |
| `GET /api/search?q=…` | Canlı + yerel arama |
| `GET /api/detail?url=…` | Detay: oyuncular, özet, fragman, bölümler, öneriler |
| `GET /api/video?url=…&key=…&customM3u8=…` | Film → tüm kaynakları çözüp proxy'li m3u8 + altyazı listesi |
| `GET /api/stream?url=…&ref=…&key=…` | HLS/segment/key/altyazı proxy'si (CORS, Range, AES-128) |
| `GET /api/subtitle?url=…` | Altyazı proxy'si + SRT→VTT |

---

## 🗂 Proje Yapısı

```
app/
  page.js                  # TV ana sayfa: hero carousel + kategori rafları + gridler
  watch/[id]/page.js       # İzleme sayfası: oynatıcı, kaynaklar, bölümler, öneriler
  api/…                    # 7 uç nokta (yukarıdaki tablo)
components/
  HlsPlayer.js             # Özel HLS oynatıcı (1.5k satır, tam özellik seti)
  TvNav.js                 # TV/remote navigasyon çekirdeği (sahte DOM testli)
lib/
  hdfc.js                  # CloudStream çekirdeği: fetch stratejileri, parser'lar, codec'ler
  catalog-data.js          # 75'lik kuratlı katalog + autoCategorize + merge
  poster.js                # SVG afiş üretici
scripts/
  rebuild-catalog.mjs      # public/movies.json yeniden derleme
tests/
  hdfc.test.mjs            # codec/parser/proxy testleri
  tvnav.test.mjs           # TV navigasyon testleri (sahte DOM)
public/
  movies.json              # Katalog veritabanı
  hls/demo/                # Yedek demo HLS stream (master + segment + altyazılar)
scraper.py                 # Canlı site tarama botu (çok stratejili, paralel)
```
