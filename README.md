# HDFilmCehennemi – Tam Katalog Botu & Özel HLS Player

Siteyi derinlemesine tarayıp **tüm filmleri bol kategoriyle** `public/movies.json`'a yazan Python botu +
şifreli m3u8 linklerini çözüp **kendi HLS oynatıcısında** oynatan Next.js uygulaması.

## Site nasıl çalışıyor? (araştırma özeti)

| Katman | Uç nokta | Not |
|---|---|---|
| Liste (JSON) | `GET /load/page/{n}/home/` · `categories/film-izle-2/` (tüm filmler) · `categories/nette-ilk-filmler/` · `categories/tavsiye-filmler-izle2/` · `imdb7/` · `mostLiked/` · `mostCommented/` · `home-series/` · `genres/<slug>/` | `X-Requested-With: fetch` başlığı ile `{html, meta}` döner; kartlar `a.poster` |
| Keşfet | `POST /movies/load/` `kesfet[type|genres|years|imdb|orderBy]`, `page` | `{html, showMore, status}` – yıl / IMDb aralığı listeleri |
| Arama | `GET /search?q=` | `{results:[html,...]}` |
| Detay | film sayfası | `div.alternative-links[data-lang] > button.alternative-link[data-video]` (Close / Rapidrame / Xbet, TR/EN) |
| Video | `GET /video/{id}/` (fetch başlığı) | `data.html` içinde `iframe[data-src]`; `?rapidrame_id=X` → `/rplayer/X/`; Close → `hdfilmcehennemi.mobi/video/embed/...` |
| Şifre | iframe içindeki `eval(function(p,a,c,k,e,d)…)` | unpack → `dc_xxx(["p1","p2",...])` ya da eski `dc_hello("b64")` → base64 / rot13 / reverse / unmix(399756995 % (i+5)) kombinasyonları (site sırayı dönüşümlü değiştiriyor, hepsi denenir) → `master.txt` / `.m3u8` |
| CDN | `srv12.cdnimages*.shop/hls/<dosya>.mp4/txt/master.txt` | `Referer`/`Origin` zorunlu → `/api/stream` proxy'si ekler |

> Site bazı bölgelerde **HTTP 451 / Cloudflare** ile engelli. Bot ve API katmanı sırayla
> direkt → mirror domainler → cloudscraper → ZenRows/ScraperAPI (opsiyonel anahtar) → Google Translate köprüsü → public proxy dener.

## Kurulum

```bash
npm install
pip install -r requirements.txt

# 1) Kataloğu çek (tüm kategoriler, ~binlerce film)
python scraper.py                      # MAX_PAGES=400 WORKERS=6 ENRICH=0 varsayılan
ENRICH=1 ENRICH_LIMIT=500 python scraper.py   # detay sayfalarından yıl/tür/özet/oyuncu ekle

# 2) Uygulama
npm run dev        # http://localhost:3000
npm run test:lib   # çözücü/ayrıştırıcı birim testleri
```

Ortam değişkenleri: `.env.example` (ZENROWS_API_KEY, SCRAPERAPI_KEY, HDFC_BASE).
GitHub Actions (`.github/workflows/update.yml`) kataloğu 6 saatte bir günceller; `Secrets` içine anahtar eklerseniz bypass otomatik devreye girer.

## Çıktı şeması (`public/movies.json`)

```json
{
  "updatedAt": "...", "total": 1234,
  "categories": [{ "name": "Korku", "group": "tür", "count": 210 }, ...],
  "movies": [{ "id": "slug", "title": "...", "href": "...", "poster": "...", "imdb": 7.4, "year": 2026,
               "type": "film", "categories": ["Yeni Eklenenler", "Korku", "IMDb 7-8", "2026"],
               "genres": [...], "description": "...", "cast": [...], "duration": "...", "trailer": "..." }]
}
```
Kategori grupları: **liste** (Yeni, Tüm Filmler, Nette İlk, Tavsiye, IMDb 7+, En Beğenilen, En Yorumlanan), **tür** (20+), **yıl**, **imdb**, **dizi**.

## API

| Uç nokta | Açıklama |
|---|---|
| `GET /api/catalog` | Botun ürettiği katalog |
| `GET /api/list?key=korku&page=2` · `?path=genres/xyz` | Siteden canlı liste |
| `GET /api/search?q=matrix` | Canlı arama |
| `GET /api/detail?url=<film>` | Detay + alternatif kaynaklar + benzer filmler |
| `GET /api/video?url=<film>` | Tüm kaynakları çözer → `{sources:[{name,lang,m3u8Url,proxyUrl,subtitles}]}` |
| `GET /api/stream?url=<m3u8>&ref=` | HLS proxy (Referer/Origin ekler, playlist URL'lerini yeniden yazar, Range destekli) |
| `GET /api/subtitle?url=` | Altyazı proxy (SRT → VTT) |

## Player özellikleri

Kalite (auto/manuel), çoklu ses parçası (TR dublaj / orijinal), altyazı (boyut & arka plan), hız 0.5–3x,
±10 sn, çift dokunma ile atlama, klavye kısayolları (Space/K, J/L, ←→, ↑↓, 0‑9, M, F, P, C, S, A, < >),
PiP, tam ekran (mobilde yatay kilit), kaldığı yerden devam, ekran görüntüsü, A‑B döngü, uyku zamanlayıcı,
istatistik paneli, kaynak değiştirme (Close/Rapidrame/TR/EN), hata durumunda otomatik kurtarma ve
"site oynatıcı" (iframe) yedeği. Ana sayfada kategori/tür/yıl/IMDb filtreleri, sıralama, favoriler, izleme geçmişi,
sonsuz kaydırma ve siteden canlı listeler bulunur.
