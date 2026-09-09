# HDFilmCehennemi – Gelişmiş Katalog Botu & Özel HLS Player (V2.0 PRO)

Bu proje, siteyi derinlemesine araştırıp **tüm filmleri zengin kategorilerle** `public/movies.json` veritabanına aktaran Python botu ile **AES-128 şifreli, çok sesli ve çok altyazılı m3u8 yayınlarını sorunsuz oynatan özel HLS video oynatıcısını** (Next.js) içerir.

---

## 🌟 Neler Geliştirildi ve Çözüldü?

### 1. 🎬 Film Oynatma Çözümü & Key / Token Alanı ("Şu an hiçbir filmi oynatmıyor" Çözümü)
- **Sorun:** Cloudflare engelleri, süresi dolan CDN bağlantıları veya şifreli `#EXT-X-KEY` anahtarları nedeniyle tarayıcı doğrudan oynatamıyordu.
- **Çözüm:**
  - **Özel Key & API Alanı:** Oynatıcı içine ve sayfa başlığına **"🔑 Key / API / Özel Akış"** modalı eklendi. Kullanıcı isterse `ZenRows / ScraperAPI` anahtarını, isterse doğrudan harici bir `M3U8 / MP4` akışını girip anında oynatabilir.
  - **AES-128 Key Proxy:** HLS `.m3u8` oynatma listelerindeki tüm segmentler (`.ts`, `fMP4`), ses dosyaları ve `#EXT-X-KEY` şifre çözme anahtarları `/api/stream` proxy'si üzerinden gerekli `Referer`, `Origin`, `User-Agent` ve `Range` başlıklarıyla otomatik çözümlenir.
  - **Çoklu Yedek Kaynak:** Canlı siteden akış alınamazsa sistem otomatik olarak yüksek kaliteli alternatif yayın sunucularını (Full HD, 4K UHD, TR Dublaj, Altyazılı) devreye alır.

### 2. 🎛️ Özel Fonksiyonlu HLS Oynatıcı (`HlsPlayer.js`)
- **Görüntü Kalitesi:** Otomatik adaptif bitrate (Auto), 1080p, 720p, 480p, 360p ve anlık bitrate (kbps / Mbps) göstergesi.
- **Çoklu Ses Parçası (Dublaj):** Türkçe Dublaj, Orijinal Ses ve dil değiştirme desteği.
- **Gelişmiş Altyazı Yönetimi:**
  - Türkçe ve İngilizce gömülü/harici altyazılar.
  - **Kendi Altyazını Yükle:** Bilgisayardan `.srt` veya `.vtt` dosyası seçip videoya anında ekleme.
  - **Altyazı Stili:** Boyut (0.8x – 1.8x), metin rengi (Beyaz, Sarı, Mavi, Yeşil) ve arka plan ayarı.
  - **Senkron Ayarı:** Altyazı kaymasını düzeltmek için **±5.0 sn** senkron kaydırma.
- **Oynatma Hızı:** 0.25x – 3.0x hız seçenekleri.
- **Gelişmiş Kontroller:**
  - ±10 sn ve ±30 sn hızlı atlama.
  - İlerleme çubuğunda hover süre önizlemesi (Time Tooltip).
  - **Sinema Modu (Theater Mode)** ve **Resim içinde Resim (PiP)**.
  - **Tam Ekran:** Mobil cihazlarda otomatik yatay ekran (landscape) kilidi.
  - **Ekran Görüntüsü (Snapshot):** Anlık video karesini tam çözünürlükte PNG olarak kaydetme.
  - **A-B Tekrar Döngüsü:** Belirlenen A ve B saniyeleri arasında sonsuz döngü.
  - **Uyku Zamanlayıcı:** 15, 30, 45, 60, 90, 120 dakika sonra otomatik durdurma.
  - **Kaldığı Yerden Devam Et:** Tarayıcı hafızasında saniyesine kadar kaydedilen son konumu hatırlama.
  - **Mobilde Jestler:** Sol taraf dikey kaydırma parlaklık, sağ taraf dikey kaydırma ses, çift dokunma ile 10sn sarma.
  - **İstatistikler (Stats for Nerds):** Canlı çözünürlük, tampon süresi, kayıp kareler ve ağ hızı paneli.
  - **Klavye Kısayolları:** Space/K, J/L, Sol/Sağ, Yukarı/Aşağı, 0-9, M, F, P, C, S, A, T, I tuşları.

### 3. 📂 Çok Fonksiyonlu Kategoriler & Gelişmiş Filtreleme
- **Kategori Grupları:**
  - **🎬 Listeler:** Yeni Eklenenler, Vizyondaki Filmler, Nette İlk, Tavsiye Filmler, IMDb 7+, En Çok Beğenilenler, En Çok Yorumlananlar, Oscar Ödüllü, 4K Ultra HD Filmler, Yerli Filmler, Yabancı Filmler.
  - **🎭 22+ Tür:** Aksiyon, Macera, Animasyon, Bilim Kurgu, Biyografi, Komedi, Suç, Belgesel, Dram, Aile, Fantastik, Tarih, Korku, Müzik, Gizem, Romantik, Savaş, Spor, Gerilim, Western, Polisiye, Anime.
  - **📅 Yıllar & Dönemler:** 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2015-2019, 2010-2014, 2000-2009, 1990-1999, 1980 Öncesi.
  - **⭐ IMDb Filtresi:** IMDb 8.5+ Başyapıtlar, IMDb 8.0+, IMDb 7.0+, IMDb 6.0+.
  - **🗣️ Dil / Ses:** Türkçe Dublaj, Türkçe Altyazılı, Dual Ses.
  - **📺 Format:** Sadece Filmler veya Sadece Diziler.
  - **⭐ Favorilerim:** Yerel hafızaya tek tıkla film kaydetme.
  - **🕘 İzleme Geçmişi:** İzlediğiniz filmlerin listesi.
- **Kombine Çoklu Filtre:** Aynı anda Tür + Yıl + Minimum IMDb + Dil + Format seçimi yapabilme.
- **3 Farklı Görünüm Modu:**
  - 🔲 Standart Kart Görünümü (Büyük afişler)
  - ▦ Kompakt Izgara Görünümü (Yoğun afişler)
  - ☰ Detaylı Liste Görünümü (Özet, oyuncular, süre, tür ve hızlı butonlar)
- **Hızlı Önizleme Modalı (Quick Info):** Film kartına tıklamadan özet, oyuncular, yönetmen ve fragmana erişim.
- **Anlık Canlı Arama:** Türkçe karakter duyarlı, siteden ve katalogdan eşzamanlı arama.

---

## 🚀 Kurulum ve Çalıştırma

```bash
# Bağımlılıkları yükleyin
npm install
pip install -r requirements.txt

# 1) Kataloğu çekin / güncelleyin (Tüm kategoriler, yüzlerce film)
python3 scraper.py

# 2) Web uygulamasını başlatın
npm run dev
# Tarayıcıda: http://localhost:3000

# 3) Testleri çalıştırın
npm run test:lib
```

---

## 📡 API Uç Noktaları

| Uç Nokta | Açıklama |
|---|---|
| `GET /api/catalog` | Tüm film ve kategori veritabanını döner |
| `GET /api/video?url=<film_url>&key=<api_key>` | Film için oynatılabilir HLS M3U8 kaynaklarını ve altyazıları döner |
| `GET /api/stream?url=<m3u8_veya_ts>&ref=<referer>&key=<key>` | HLS akış ve segment proxy'si (CORS, Range, AES-128 Key ve başlık desteği) |
| `GET /api/subtitle?url=<srt_veya_vtt>` | Altyazı proxy'si ve SRT → WebVTT dönüştürücü |
| `GET /api/detail?url=<film_url>` | Film detayları, oyuncular, özet, fragman ve benzer filmler |
| `GET /api/search?q=<kelime>` | Canlı ve yerel katalog araması |
| `GET /api/list?key=<kategori_key>&page=1` | Siteden anlık kategori listesi çekimi |
