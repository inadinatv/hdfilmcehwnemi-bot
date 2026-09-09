#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HDFilmCehennemi – Tam Katalog Botu
==================================

Siteyi derinlemesine tarayıp TÜM filmleri, bol kategoriyle birlikte
`public/movies.json` dosyasına yazar.

Taranan kaynaklar
-----------------
* /load/page/{n}/home/                       → Yeni eklenen filmler
* /load/page/{n}/categories/film-izle-2/     → TÜM filmler (ana havuz)
* /load/page/{n}/categories/<slug>/          → Küratörlü listeler (Nette İlk, Tavsiye, ...)
* /load/page/{n}/imdb7/ mostLiked/ mostCommented/
* /load/page/{n}/genres/<slug>/              → Türler (statik liste + ana sayfadan otomatik keşif)
* POST /movies/load/  (kesfet[...])          → Yıl ve IMDb aralığı listeleri
* Film detay sayfası (opsiyonel, ENRICH=1)   → yıl, tür, özet, oyuncu, süre, IMDb

Ortam değişkenleri
------------------
HDFC_BASE            Ana domain (varsayılan https://www.hdfilmcehennemi.nl)
MAX_PAGES            Kategori başına en fazla sayfa (varsayılan 400)
WORKERS              Paralel iş parçacığı (varsayılan 6)
ENRICH               1 → film detay sayfalarından zenginleştir
ENRICH_LIMIT         Zenginleştirilecek en fazla film (varsayılan 250)
SKIP_YEARS           1 → yıl/IMDb keşfet taramasını atla
ZENROWS_API_KEY      Opsiyonel: ZenRows ile Cloudflare/geo bypass
SCRAPERAPI_KEY       Opsiyonel: ScraperAPI ile bypass
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, quote

import requests
from bs4 import BeautifulSoup

try:  # opsiyonel – Cloudflare "Just a moment" sayfasını aşmaya yardımcı olur
    import cloudscraper  # type: ignore
except Exception:  # pragma: no cover
    cloudscraper = None

# ─────────────────────────────── Ayarlar ────────────────────────────────

BASE_URL = os.getenv("HDFC_BASE", "https://www.hdfilmcehennemi.nl").rstrip("/")
MIRRORS = [
    BASE_URL,
    "https://www.hdfilmcehennemi.nl",
    "https://www.hdfilmcehennemi.com",
    "https://www.hdfilmcehennemi.ws",
    "https://hdfilmcehennemini.org",
]
MIRRORS = list(dict.fromkeys(MIRRORS))  # sırayı koruyarak tekilleştir

MAX_PAGES = int(os.getenv("MAX_PAGES", "400"))
WORKERS = int(os.getenv("WORKERS", "6"))
ENRICH = os.getenv("ENRICH", "0") == "1"
ENRICH_LIMIT = int(os.getenv("ENRICH_LIMIT", "250"))
SKIP_YEARS = os.getenv("SKIP_YEARS", "0") == "1"
ZENROWS_API_KEY = os.getenv("ZENROWS_API_KEY", "").strip()
SCRAPERAPI_KEY = os.getenv("SCRAPERAPI_KEY", "").strip()
OUT_DIR = "public"
OUT_FILE = os.path.join(OUT_DIR, "movies.json")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

API_HEADERS = {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    "X-Requested-With": "fetch",
    "Referer": BASE_URL + "/",
}
PAGE_HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/",
}

# Statik kategori tanımları  (ad, load-path, grup)
STATIC_LISTS = [
    ("Yeni Eklenenler",        "home",                                   "liste"),
    ("Tüm Filmler",            "categories/film-izle-2",                 "liste"),
    ("Nette İlk Filmler",      "categories/nette-ilk-filmler",           "liste"),
    ("Tavsiye Filmler",        "categories/tavsiye-filmler-izle2",       "liste"),
    ("IMDb 7+ Filmler",        "imdb7",                                  "liste"),
    ("En Çok Beğenilenler",    "mostLiked",                              "liste"),
    ("En Çok Yorumlananlar",   "mostCommented",                          "liste"),
    ("Yeni Eklenen Diziler",   "home-series",                            "dizi"),
]

# Bilinen tür slug'ları (sitede zamanla değişebiliyor → ana sayfadan da keşfedilir)
STATIC_GENRES = {
    "Aile":        ["aile-filmleri-izleyin-6"],
    "Aksiyon":     ["aksiyon-filmleri-izleyin-5", "aksiyon-filmleri-izleyin-3"],
    "Animasyon":   ["animasyon-filmlerini-izleyin-5", "animasyon-filmlerini-izleyin-4"],
    "Belgesel":    ["belgesel-filmlerini-izle-1"],
    "Bilim Kurgu": ["bilim-kurgu-filmlerini-izleyin-3", "bilim-kurgu-filmlerini-izleyin-2"],
    "Biyografi":   ["biyografi-filmleri-izle-1"],
    "Dram":        ["dram-filmleri-izle-1"],
    "Fantastik":   ["fantastik-filmleri-izle-1"],
    "Gerilim":     ["gerilim-filmleri-izle-1"],
    "Gizem":       ["gizem-filmleri-izle-1"],
    "Komedi":      ["komedi-filmlerini-izleyin-1"],
    "Korku":       ["korku-filmlerini-izle-4", "korku-filmlerini-izle-2"],
    "Macera":      ["macera-filmleri-izle-1"],
    "Müzik":       ["muzik-filmleri-izle-1"],
    "Romantik":    ["romantik-filmleri-izle-2", "romantik-filmleri-izle-1"],
    "Savaş":       ["savas-filmleri-izle-1"],
    "Spor":        ["spor-filmleri-izle-1"],
    "Suç":         ["suc-filmleri-izle-3"],
    "Tarih":       ["tarih-filmleri-izle-4"],
    "Western":     ["western-filmleri-izle-1"],
}

# Keşfet (POST /movies/load/) tür kimlikleri – Aniyomi eklentisinden
KESFET_GENRE_IDS = {
    "Aksiyon": "1", "Macera": "2", "Animasyon": "3", "Komedi": "4", "Suç": "5",
    "Belgesel": "6", "Dram": "7", "Aile": "8", "Fantastik": "9", "Tarih": "10",
    "Korku": "11", "Müzik": "12", "Gizem": "13", "Romantik": "14", "Gerilim": "16",
    "Savaş": "17", "Western": "18", "Bilim Kurgu": "24", "Biyografi": "26",
    "Spor": "28", "Polisiye": "32",
}
KESFET_YEARS = [str(y) for y in range(datetime.now().year, 2015, -1)] + \
               ["2010-2015", "2000-2010", "1901-2000"]
KESFET_IMDB = [("IMDb 9+", "9-10"), ("IMDb 8-9", "8-9"), ("IMDb 7-8", "7-8"),
               ("IMDb 6-7", "6-7")]

# ─────────────────────────────── Log ────────────────────────────────────

_log_lock = threading.Lock()


def log(msg: str) -> None:
    with _log_lock:
        print(msg, flush=True)


# ───────────────────────────── HTTP katmanı ─────────────────────────────

class Fetcher:
    """Çok stratejili istek katmanı: direkt → mirror → cloudscraper →
    Google Translate köprüsü → ZenRows / ScraperAPI → herkese açık CORS proxy."""

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA})
        self.cs = cloudscraper.create_scraper() if cloudscraper else None
        self.active_base = BASE_URL
        self.strategy_stats: dict[str, int] = {}
        self._lock = threading.Lock()

    # -- yardımcılar ------------------------------------------------------
    @staticmethod
    def _blocked(text: str, status: int) -> bool:
        if status in (403, 429, 451, 503):
            return True
        head = text[:4000]
        return ("Just a moment" in head or "Bir dakika lütfen" in head or
                "cf-browser-verification" in head or "Yasal Nedenlerle" in head or
                "Please contact the site owner" in head)

    def _bump(self, name: str) -> None:
        with self._lock:
            self.strategy_stats[name] = self.strategy_stats.get(name, 0) + 1

    @staticmethod
    def _to_translate(url: str) -> str:
        p = urlparse(url)
        host = p.netloc.replace("-", "--").replace(".", "-")
        q = f"{p.path}?{p.query}" if p.query else p.path
        sep = "&" if "?" in q else "?"
        return f"https://{host}.translate.goog{q}{sep}_x_tr_sl=tr&_x_tr_tl=tr&_x_tr_hl=tr&_x_tr_pto=wapp"

    # -- ana giriş --------------------------------------------------------
    def get(self, path_or_url: str, *, api: bool = True, method: str = "GET",
            data=None, files=None, timeout: int = 25, retries: int = 2) -> str | None:
        """Metin döndürür; hiçbir strateji başarılı olamazsa None."""
        headers = dict(API_HEADERS if api else PAGE_HEADERS)
        bases = [self.active_base] + [m for m in MIRRORS if m != self.active_base]
        absolute = path_or_url.startswith("http")

        for attempt in range(retries + 1):
            # 1) direkt / mirror
            for base in ([None] if absolute else bases):
                url = path_or_url if absolute else f"{base}{path_or_url}"
                if not absolute:
                    headers["Referer"] = base + "/"
                text = self._try(self.session, url, headers, method, data, files, timeout)
                if text is not None:
                    if base and base != self.active_base:
                        log(f"↪ Aktif domain değişti: {base}")
                        self.active_base = base
                    self._bump("direct")
                    return text

            # 2) cloudscraper
            if self.cs is not None:
                url = path_or_url if absolute else f"{self.active_base}{path_or_url}"
                text = self._try(self.cs, url, headers, method, data, files, timeout)
                if text is not None:
                    self._bump("cloudscraper")
                    return text

            url = path_or_url if absolute else f"{self.active_base}{path_or_url}"

            # 3) ZenRows / ScraperAPI (yalnızca GET)
            if method == "GET" and ZENROWS_API_KEY:
                zr = ("https://api.zenrows.com/v1/?apikey=" + ZENROWS_API_KEY +
                      "&url=" + quote(url, safe="") +
                      "&custom_headers=true")
                text = self._try(self.session, zr, {"X-Requested-With": "fetch",
                                                    "Referer": self.active_base + "/"},
                                 "GET", None, None, 60)
                if text is not None:
                    self._bump("zenrows")
                    return text
            if method == "GET" and SCRAPERAPI_KEY:
                sa = ("https://api.scraperapi.com/?api_key=" + SCRAPERAPI_KEY +
                      "&keep_headers=true&url=" + quote(url, safe=""))
                text = self._try(self.session, sa, headers, "GET", None, None, 60)
                if text is not None:
                    self._bump("scraperapi")
                    return text

            # 4) Google Translate köprüsü (yalnızca GET)
            if method == "GET":
                text = self._try(self.session, self._to_translate(url), headers,
                                 "GET", None, None, timeout)
                if text is not None:
                    self._bump("translate")
                    return self._clean_translate(text)

            # 5) Herkese açık proxy'ler (yalnızca GET, header taşıyamaz → HTML sayfalar için)
            if method == "GET":
                for prx in (f"https://api.codetabs.com/v1/proxy?quest={quote(url, safe='')}",
                            f"https://corsproxy.io/?{quote(url, safe='')}"):
                    text = self._try(self.session, prx, headers, "GET", None, None, timeout)
                    if text is not None:
                        self._bump("public-proxy")
                        return text

            time.sleep(1.5 * (attempt + 1))
        return None

    def _try(self, client, url, headers, method, data, files, timeout) -> str | None:
        try:
            if method == "POST":
                r = client.post(url, headers=headers, data=data, files=files, timeout=timeout)
            else:
                r = client.get(url, headers=headers, timeout=timeout)
            text = r.text or ""
            if self._blocked(text, r.status_code):
                return None
            if r.status_code >= 400:
                # 404 gibi cevaplar "sayfa yok" anlamına gelir → boş metin döndürelim
                return "" if r.status_code == 404 else None
            return text
        except requests.RequestException:
            return None

    @staticmethod
    def _clean_translate(text: str) -> str:
        # translate.goog kendi domainini enjekte eder; orijinal domaine çevir
        text = re.sub(r"https?://www-hdfilmcehennemi-[a-z]+\.translate\.goog",
                      BASE_URL, text)
        text = re.sub(r"[?&]_x_tr_[a-z]+=[^&\"'\s]*", "", text)
        return text

    # -- JSON kolaylığı ---------------------------------------------------
    def get_json(self, path: str, **kw):
        text = self.get(path, api=True, **kw)
        if not text:
            return None
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Translate köprüsü bazen JSON'u <pre> içine sarar
            m = re.search(r"\{.*\}", text, re.S)
            if m:
                try:
                    return json.loads(m.group(0))
                except json.JSONDecodeError:
                    pass
            # düz HTML gelmiş olabilir
            if "<a" in text:
                return {"html": text}
        return None


fetcher = Fetcher()

# ──────────────────────────── Ayrıştırıcılar ────────────────────────────

_YEAR_RE = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")


def slug_of(href: str) -> str:
    path = urlparse(href).path.strip("/")
    return path.split("/")[-1] if path else href


def fix_url(u: str | None) -> str | None:
    if not u:
        return None
    u = u.strip()
    if u.startswith("//"):
        return "https:" + u
    if u.startswith("/"):
        return BASE_URL + u
    return u


def parse_cards(html: str) -> list[dict]:
    """Bir HTML parçasından film kartlarını çıkarır."""
    soup = BeautifulSoup(html or "", "html.parser")
    cards: list[dict] = []
    seen: set[str] = set()

    anchors = soup.select("a.poster") or soup.find_all("a")
    for a in anchors:
        href = a.get("href")
        if not href:
            continue
        href = fix_url(href)
        if "hdfilmcehennemi" not in href and not href.startswith(BASE_URL):
            continue
        img = a.find("img")
        title_el = a.select_one("strong.poster-title, h4.title, .title")
        title = (a.get("title") or (title_el.get_text(" ", strip=True) if title_el else "")
                 or (img.get("alt") if img else "") or "").strip()
        if not title or not img:
            continue
        poster = fix_url(img.get("data-src") or img.get("src"))
        if not poster or poster.startswith("data:"):
            continue
        sid = slug_of(href)
        if sid in seen or "/dizi/" in href and "/sezon" in href:
            continue
        seen.add(sid)

        imdb_el = a.select_one("span.imdb, .imdb, .poster-meta .rating")
        imdb = None
        if imdb_el:
            m = re.search(r"\d+(?:[.,]\d+)?", imdb_el.get_text())
            if m:
                imdb = float(m.group(0).replace(",", "."))

        year = None
        year_el = a.select_one(".year, .poster-year, .poster-meta span")
        if year_el:
            m = _YEAR_RE.search(year_el.get_text())
            if m:
                year = int(m.group(1))
        if not year:
            m = _YEAR_RE.search(sid)
            if m:
                year = int(m.group(1))

        quality_el = a.select_one(".quality, .poster-quality, .badge")
        quality = quality_el.get_text(strip=True) if quality_el else None

        cards.append({
            "id": sid,
            "title": re.sub(r"\s+", " ", title).replace(" izle", "").strip(),
            "href": href,
            "poster": poster,
            "imdb": imdb,
            "year": year,
            "quality": quality,
            "type": "dizi" if "/dizi/" in href else "film",
        })
    return cards


def discover_genres(home_html: str) -> dict[str, list[str]]:
    """Ana sayfadaki menüden /tur/<slug> ve /category/<slug> bağlantılarını keşfeder."""
    found: dict[str, list[str]] = {}
    soup = BeautifulSoup(home_html or "", "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"/tur/([a-z0-9-]+)/?$", href)
        if m:
            name = a.get_text(" ", strip=True) or m.group(1)
            name = re.sub(r"\s*(filmleri(ni)?|izle(yin)?)\s*", " ", name, flags=re.I).strip() or name
            found.setdefault(name.title(), []).append(m.group(1))
    return found


# ────────────────────────────── Tarayıcı ────────────────────────────────

class Catalog:
    def __init__(self) -> None:
        self.movies: dict[str, dict] = {}
        self.categories: dict[str, dict] = {}
        self.lock = threading.Lock()

    def add(self, card: dict, cat_name: str, cat_group: str) -> None:
        with self.lock:
            m = self.movies.get(card["id"])
            if m is None:
                m = dict(card)
                m["categories"] = []
                self.movies[card["id"]] = m
            else:
                for k in ("imdb", "year", "quality", "poster"):
                    if not m.get(k) and card.get(k):
                        m[k] = card[k]
            if cat_name not in m["categories"]:
                m["categories"].append(cat_name)
            c = self.categories.setdefault(cat_name, {"name": cat_name, "group": cat_group, "count": 0})
            c["count"] += 1


catalog = Catalog()


def crawl_load_path(name: str, path: str, group: str, max_pages: int = MAX_PAGES) -> int:
    """`/load/page/{n}/{path}/` uç noktasını sayfa sayfa tarar."""
    total = 0
    empty_streak = 0
    seen_pages: set[str] = set()
    for page in range(1, max_pages + 1):
        data = fetcher.get_json(f"/load/page/{page}/{path.strip('/')}/")
        if data is None:
            log(f"   ⚠ {name}: sayfa {page} alınamadı")
            empty_streak += 1
            if empty_streak >= 2:
                break
            continue
        html = data.get("html", "") if isinstance(data, dict) else ""
        if not html or "Sayfa Bulunamadı" in html:
            break
        cards = parse_cards(html)
        if not cards:
            break
        sig = ",".join(c["id"] for c in cards[:5])
        if sig in seen_pages:  # site son sayfayı tekrar veriyor olabilir
            break
        seen_pages.add(sig)
        empty_streak = 0
        for c in cards:
            catalog.add(c, name, group)
        total += len(cards)
        if len(cards) < 12:  # sayfa dolmamış → son sayfa
            break
        time.sleep(0.15)
    log(f"✔ {name:<28} {total:>5} kart  ({path})")
    return total


def crawl_kesfet(name: str, group: str, *, years: str = "", genres: str = "",
                 imdb: str = "", order: str = "posts.year desc", max_pages: int = 60) -> int:
    """POST /movies/load/ keşfet filtresi ile tarama (yıl / IMDb aralıkları için)."""
    total = 0
    for page in range(1, max_pages + 1):
        files = {
            "kesfet[type]": (None, "1"),
            "kesfet[genres]": (None, genres),
            "kesfet[years]": (None, years),
            "kesfet[imdb]": (None, imdb),
            "kesfet[orderBy]": (None, order),
            "page": (None, str(page)),
        }
        text = fetcher.get("/movies/load/", api=True, method="POST", files=files)
        if not text:
            break
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            break
        if data.get("status") not in (1, "1", True):
            break
        cards = parse_cards(data.get("html", ""))
        if not cards:
            break
        for c in cards:
            catalog.add(c, name, group)
        total += len(cards)
        if not data.get("showMore"):
            break
        time.sleep(0.15)
    if total:
        log(f"✔ {name:<28} {total:>5} kart  (keşfet)")
    return total


def enrich_movie(movie: dict) -> None:
    """Film detay sayfasından ek bilgi çeker."""
    html = fetcher.get(movie["href"], api=False)
    if not html:
        return
    soup = BeautifulSoup(html, "html.parser")
    info: dict = {}
    t = soup.select_one("h1.section-title, .section-title")
    if t:
        info["title"] = re.split(r"\s+izle\b", t.get_text(" ", strip=True), 1)[0].strip()
    genres = [a.get_text(strip=True) for a in soup.select("div.post-info-genres a")]
    if genres:
        info["genres"] = genres
    y = soup.select_one("div.post-info-year-country a")
    if y and _YEAR_RE.search(y.get_text()):
        info["year"] = int(_YEAR_RE.search(y.get_text()).group(1))
    country = soup.select("div.post-info-year-country a")
    if len(country) > 1:
        info["country"] = country[-1].get_text(strip=True)
    r = soup.select_one("div.post-info-imdb-rating span")
    if r:
        m = re.search(r"\d+(?:[.,]\d+)?", r.get_text())
        if m:
            info["imdb"] = float(m.group(0).replace(",", "."))
    d = soup.select_one("article.post-info-content > p, div.post-info-content > p")
    if d:
        info["description"] = d.get_text(" ", strip=True)
    cast = [a.select_one("strong").get_text(strip=True) for a in soup.select("div.post-info-cast a")
            if a.select_one("strong")]
    if cast:
        info["cast"] = cast[:12]
    dur = soup.select_one("div.post-info-duration, .post-info-duration")
    if dur:
        info["duration"] = dur.get_text(" ", strip=True)
    tr = soup.select_one("div.post-info-trailer button[data-modal]")
    if tr:
        vid = tr["data-modal"].split("trailer/")[-1]
        if vid:
            info["trailer"] = f"https://www.youtube.com/watch?v={vid}"
    poster = soup.select("aside.post-info-poster img.lazyload, .post-info-poster img")
    if poster:
        p = poster[-1].get("data-src") or poster[-1].get("src")
        if p:
            info["poster_hd"] = fix_url(p)
    langs = [el.get("data-lang", "").upper() for el in soup.select("div.alternative-links[data-lang]")]
    if langs:
        info["languages"] = sorted(set(l for l in langs if l))
    sources = [b.get_text(strip=True) for b in soup.select("button.alternative-link")]
    if sources:
        info["sources"] = sorted(set(sources))

    with catalog.lock:
        movie.update({k: v for k, v in info.items() if v})
        movie["enriched"] = True
        for g in info.get("genres", []):
            if g not in movie["categories"]:
                movie["categories"].append(g)
                c = catalog.categories.setdefault(g, {"name": g, "group": "tür", "count": 0})
                c["count"] += 1


# ──────────────────────────────── Main ──────────────────────────────────

def load_previous() -> dict:
    try:
        with open(OUT_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("movies"), list):
            return {m.get("id") or slug_of(m["href"]): m for m in data["movies"] if m.get("href")}
    except Exception:
        pass
    return {}


def main() -> int:
    t0 = time.time()
    log("🚀 HDFilmCehennemi tam katalog botu başlatıldı")
    log(f"   base={BASE_URL}  max_pages={MAX_PAGES}  workers={WORKERS}  enrich={ENRICH}")

    previous = load_previous()
    if previous:
        log(f"📦 Önceki katalog: {len(previous)} film (birleştirilecek)")

    # 1) Ana sayfadan tür/kategori keşfi
    home_html = fetcher.get("/", api=False) or ""
    discovered = discover_genres(home_html)
    if discovered:
        log(f"🔎 Ana sayfadan {len(discovered)} tür keşfedildi")
    genres: dict[str, list[str]] = {k: list(v) for k, v in STATIC_GENRES.items()}
    for name, slugs in discovered.items():
        genres.setdefault(name, [])
        for s in slugs:
            if s not in genres[name]:
                genres[name].insert(0, s)  # keşfedilen slug öncelikli

    # 2) Görev listesi
    tasks: list[tuple] = []
    for name, path, group in STATIC_LISTS:
        tasks.append(("load", name, path, group))
    for name, slugs in genres.items():
        tasks.append(("genre", name, slugs, "tür"))

    # 3) Paralel tarama
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = []
        for t in tasks:
            if t[0] == "load":
                futures.append(ex.submit(crawl_load_path, t[1], t[2], t[3]))
            else:
                def run_genre(name=t[1], slugs=t[2]):
                    for s in slugs:
                        if crawl_load_path(name, f"genres/{s}", "tür"):
                            return
                        if crawl_load_path(name, f"categories/{s}", "tür"):
                            return
                futures.append(ex.submit(run_genre))
        if not SKIP_YEARS:
            for y in KESFET_YEARS:
                label = y if "-" in y else f"{y}"
                if y == "1901-2000":
                    label = "2000 Öncesi"
                elif "-" in y:
                    label = y.replace("-", " – ")
                futures.append(ex.submit(crawl_kesfet, label, "yıl", years=y))
            for label, rng in KESFET_IMDB:
                futures.append(ex.submit(crawl_kesfet, label, "imdb", imdb=rng, order="posts.imdb desc"))
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:  # pragma: no cover
                log(f"   ✖ görev hatası: {e}")

    # 4) Önceki veriyle birleştir (zenginleştirmeleri koru)
    for sid, old in previous.items():
        cur = catalog.movies.get(sid)
        if cur is None:
            old.setdefault("categories", [])
            if "Arşiv" not in old["categories"]:
                old["categories"].append("Arşiv")
            catalog.movies[sid] = old
            c = catalog.categories.setdefault("Arşiv", {"name": "Arşiv", "group": "liste", "count": 0})
            c["count"] += 1
        else:
            for k, v in old.items():
                if k in ("categories",):
                    for cat in v:
                        if cat not in cur["categories"] and cat != "Arşiv":
                            cur["categories"].append(cat)
                elif not cur.get(k) and v:
                    cur[k] = v

    # 5) Opsiyonel zenginleştirme
    if ENRICH and catalog.movies:
        todo = [m for m in catalog.movies.values() if not m.get("enriched")][:ENRICH_LIMIT]
        log(f"🧪 {len(todo)} film detay sayfasından zenginleştiriliyor…")
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            list(ex.map(enrich_movie, todo))

    # 6) Kategori sayaçlarını yeniden hesapla ve yaz
    counts: dict[str, int] = {}
    for m in catalog.movies.values():
        for c in m.get("categories", []):
            counts[c] = counts.get(c, 0) + 1
    for name, n in counts.items():
        catalog.categories.setdefault(name, {"name": name, "group": "tür", "count": 0})["count"] = n

    movies = sorted(catalog.movies.values(),
                    key=lambda m: ("Yeni Eklenenler" not in m.get("categories", []),
                                   -(m.get("year") or 0), m.get("title", "")))
    group_order = {"liste": 0, "tür": 1, "yıl": 2, "imdb": 3, "dizi": 4}
    cats = sorted(catalog.categories.values(),
                  key=lambda c: (group_order.get(c["group"], 9), -c["count"], c["name"]))

    if not movies:
        log("❌ HATA: Hiç film bulunamadı (site erişimi engellenmiş olabilir). Eski dosya korunuyor.")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    out = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": fetcher.active_base,
        "total": len(movies),
        "strategies": fetcher.strategy_stats,
        "categories": cats,
        "movies": movies,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    log("─" * 60)
    log(f"✅ {len(movies)} film · {len(cats)} kategori → {OUT_FILE}")
    log(f"⏱  {time.time() - t0:.1f} sn · stratejiler: {fetcher.strategy_stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
