# Yetkili Iframe Kaynakları İçin Gelişmiş Scraper Stratejisi

## Kapsam ve sınır

Bu tasarım, kullanıcının **sahibi olduğu veya açıkça yeniden gömme izni aldığı** film/video kaynaklarının kataloglanması içindir. Scraper:

- `robots.txt`, kullanım şartları ve sağlayıcı API koşullarına uyar.
- Yalnızca açık HTTP yanıtlarında veya yetkili hesap/API ile erişilen veriyi işler.
- Sayfanın normal JavaScript ile oluşturulmasını destekler.
- CAPTCHA, anti-bot, WAF, oturum kilidi, ödeme duvarı, DRM, imza/şifreli URL veya referer kısıtlamasını aşmaya çalışmaz.
- Kaynak bulunamazsa sahte HLS/iframe üretmez; kaydı `unavailable` olarak işaretler.

> Mevcut katalogda 23 film tarandı, **0 doğrulanmış iframe** bulundu. Bu nedenle bu strateji mevcut siteyi zorlayarak kaynak çıkarmayı değil, yetkili bir kaynak sağlayıcısından güvenilir veri alma akışını tanımlar.

## Önerilen veri akışı

```text
Kaynak kayıtları / yetkili API
        |
        v
URL normalizasyonu + robots/izin kontrolü
        |
        v
Kaynak adaptörü (API / statik HTML / normal JS render)
        |
        v
Iframe ve video adaylarını çıkarma
        |
        v
Güvenlik + alan adı izin listesi + URL doğrulama
        |
        v
Kaynak sağlık kontrolü (HEAD/GET, içerik türü, embed politikası)
        |
        v
movies.json + scrape-report.json
        |
        v
GitHub Pages katalog/player
```

## İki uygulanabilir çalışma modeli

| Yaklaşım | Takaslar | Maliyet | Kurulum karmaşıklığı |
|---|---|---:|---:|
| **Yetkili sağlayıcı API’si + GitHub Actions** | En güvenilir ve hızlıdır; sağlayıcının API erişimi ve izinli alan adları gerekir. Tarayıcı render’ı gerekmez. | Düşük/sağlayıcı planına bağlı | Orta |
| **Yetkili alan adlarında normal JS render + periyodik görev** | Dinamik sayfalarda çalışır; daha yavaş ve kırılgandır. Playwright/Chromium gerektirir. | Orta | Yüksek |
| **Hafif statik HTML scraper** | En ucuz seçenektir; yalnızca HTML içinde açık iframe varsa çalışır. | Çok düşük | Düşük |

**Öneri:** Önce API veya statik HTML adaptörüyle başlayın. JS render yalnızca sağlayıcının size ait/yetkili alan adlarında gerçekten gerekiyorsa açılmalı. Sürekli ve otomatik çalıştırma için mevcut GitHub Actions akışı, düşük sıklıklı katalog güncellemelerinde yeterlidir.

## Kaynak adaptörleri

Her sağlayıcı için genel scraper yerine ayrı bir adaptör kullanılır:

```python
class SourceAdapter(Protocol):
    def can_handle(self, url: str) -> bool: ...
    def fetch_detail(self, url: str) -> str: ...
    def extract_candidates(self, html: str, page_url: str) -> list[dict]: ...
```

### 1. API adaptörü — tercih edilen yol

- Sağlayıcının resmi endpoint’i kullanılır.
- API anahtarı repository secret olarak tutulur.
- Film kimliği ile `embed_url`, `iframe_url`, `hls_url` ve dil bilgisi alınır.
- API yanıtı JSON schema ile doğrulanır.
- API dokümantasyonu yoksa endpoint tahmin edilmez.

### 2. Statik HTML adaptörü

Aşağıdaki açık alanlar aranır:

- `<iframe src="...">`
- `<video src="...">`
- `<source src="..." type="application/x-mpegURL">`
- JSON-LD veya açık `data-video-url` alanları
- Sağlayıcının dokümante ettiği `embedUrl` alanı

Relative URL’ler `urljoin()` ile mutlaklaştırılır. Inline script içinde obfuscation çözme veya imza kırma yapılmaz.

### 3. Normal JS render adaptörü

Yalnızca yetkili alan adı allowlist içinde ise:

1. Sayfayı Chromium/Playwright ile aç.
2. En fazla belirlenen bekleme süresinde DOM’un oluşmasını bekle.
3. `iframe`, `video` ve `source` elementlerini DOM’dan oku.
4. Ağ trafiğinden yalnızca açıkça izin verilen medya isteklerini gözlemle.
5. DRM, challenge, CAPTCHA veya oturum engeli görülürse dur ve `blocked_by_access_policy` yaz.

Tarayıcı otomasyonu giriş bilgisi toplamaz, CAPTCHA çözmez ve erişim kontrollerini atlatmaz.

## Aday URL doğrulama

Her aday aşağıdaki kontrollerden geçer:

1. Şema yalnızca `https` (geliştirme için isteğe bağlı `http`).
2. Host, kaynak sağlayıcının allowlist’inde.
3. Kullanıcı adı/parola içeren URL reddedilir.
4. `javascript:`, `data:`, `blob:` ve yerel dosya URL’leri reddedilir.
5. URL boyutu ve parametre sayısı sınırlandırılır.
6. Sağlayıcının embed izni ve kullanım şartları kontrol edilir.
7. `X-Frame-Options` veya CSP gömme engeli varsa player’a kaynak eklenmez.
8. HLS ise içerik türü ve playlist formatı doğrulanır; DRM manifestleri reddedilir.

Örnek allowlist:

```json
{
  "allowedEmbedHosts": [
    "video.example-owned.com",
    "player.example-owned.com"
  ],
  "allowedMediaTypes": [
    "text/html",
    "application/vnd.apple.mpegurl",
    "application/x-mpegURL",
    "video/mp4"
  ]
}
```

## JSON sözleşmesi

```json
{
  "id": "movie-123",
  "title": "Örnek Film",
  "href": "https://catalog.example-owned.com/movie-123",
  "iframes": [
    {
      "src": "https://player.example-owned.com/embed/movie-123",
      "title": "Türkçe altyazı",
      "provider": "Example Player",
      "language": "tr",
      "quality": "1080p",
      "verified": true,
      "verifiedAt": "2026-09-27T00:00:00Z",
      "checks": {
        "https": true,
        "allowlistedHost": true,
        "embedReachable": true,
        "frameAllowed": true
      }
    }
  ],
  "sources": [],
  "availability": "available",
  "scrape": {
    "status": "ok",
    "adapter": "example-api",
    "attempts": 1,
    "checkedAt": "2026-09-27T00:00:00Z"
  }
}
```

İzinli kaynak yoksa:

```json
{
  "iframes": [],
  "sources": [],
  "availability": "unavailable",
  "scrape": {
    "status": "blocked_by_access_policy",
    "reason": "No authorized embed returned by provider"
  }
}
```

## Dayanıklılık ve kalite

- Her URL için 3 denemeden fazla yapılmaz.
- Denemeler arasında exponential backoff: 2s, 5s, 12s.
- Aynı host için eşzamanlı istek sayısı 2 ile sınırlanır.
- `ETag`/`Last-Modified` kullanılarak değişmeyen sayfalar tekrar indirilmez.
- Son başarılı veri korunur; başarısız tarama boş katalogla üzerine yazmaz.
- Kaynak sayısı, yeni/çıkan iframe sayısı ve hata oranı raporlanır.
- Önceki kaynağın değişmesi için diff raporu üretilir.

## Güvenlik

- Secrets yalnızca Actions secrets içinde tutulur.
- HTML/URL verileri player’a yazılırken escape edilir.
- Iframe için `sandbox`, `allow`, `referrerpolicy` değerleri sabit politikadan gelir.
- Katalog JSON’una keyfi JavaScript veya inline HTML yazılmaz.
- Player tarafında yalnızca `verified: true` kaynaklar açılır.
- Her kaynak için `Content-Security-Policy: frame-src` allowlist’i güncellenir.

## Test planı

1. **Parser testleri:** statik HTML fixture içinde iframe/video/source ayrıştırma.
2. **Allowlist testleri:** izinli host geçer; bilinmeyen host reddedilir.
3. **URL güvenlik testleri:** `javascript:`, `data:`, kullanıcı bilgili URL ve redirect zinciri reddedilir.
4. **Schema testleri:** JSON çıktısı zorunlu alanları içerir.
5. **Regression testleri:** kaynak kaybolduğunda eski doğrulanmış kayıt korunur veya `unavailable` raporlanır.
6. **Player smoke test:** doğrulanmış test iframe’i modal içinde açılır.
7. **No-source test:** kaynak olmayan filmde sahte player gösterilmez; açık durum mesajı gösterilir.

## GitHub Actions akışı

```yaml
- name: Yetkili katalog kaynaklarını tara
  env:
    PROVIDER_API_KEY: ${{ secrets.PROVIDER_API_KEY }}
  run: python scraper.py --adapter example-api --verify-embeds

- name: JSON şemasını doğrula
  run: python tools/validate_catalog.py public/movies.json

- name: Değişiklik raporu oluştur
  run: python tools/catalog_report.py public/movies.json --out scrape-report.json

- name: Kataloğu yayınla
  run: |
    cp public/movies.json movies.json
    git add public/movies.json movies.json scrape-report.json
    git diff --cached --quiet || git commit -m "chore: update authorized video catalog"
    git push
```

## Bu proje için somut sonraki adım

1. Kullanıcının sahip olduğu veya kullanım izni bulunan video sağlayıcı alan adlarını allowlist’e eklemek.
2. Sağlayıcının resmi API dokümanı ve test anahtarını `PROVIDER_API_KEY` olarak tanımlamak.
3. Bir sağlayıcı adaptörü yazmak.
4. Test hesabındaki tek bir film ile iframe doğrulaması yapmak.
5. Smoke test başarılı olduktan sonra katalog taramasını tüm filmlere açmak.
6. Kaynağı olmayan kayıtları player gibi göstermemek; mevcut resmi fragman fallback’ini korumak.
