#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HDFilmCehennemi – Tam Katalog Botu (Gelişmiş Sürüm)
==================================================

Siteyi derinlemesine tarayıp TÜM filmleri, bol kategoriyle birlikte
`public/movies.json` dosyasına yazar.

Taranan kaynaklar
-----------------
* /load/page/{n}/home/                       → Yeni eklenen filmler
* /load/page/{n}/categories/film-izle-2/     → TÜM filmler (ana havuz)
* /load/page/{n}/categories/vizyondaki-filmler/ → Vizyondaki filmler
* /load/page/{n}/categories/nette-ilk-filmler/  → Nette İlk filmler
* /load/page/{n}/categories/tavsiye-filmler-izle2/ → Tavsiye filmler
* /load/page/{n}/imdb7/ mostLiked/ mostCommented/
* /load/page/{n}/genres/<slug>/              → 25+ Tür (Aksiyon, Komedi, Korku, Bilim Kurgu, ...)
* /load/page/{n}/home-series/                → Popüler Diziler
* POST /movies/load/  (kesfet[...])          → Yıl ve IMDb aralığı listeleri
* Film detay sayfası (ENRICH=1)              → yıl, tür, özet, oyuncu, yönetmen, süre, IMDb, fragman
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
from urllib.parse import urlparse, quote, urljoin

import requests
from bs4 import BeautifulSoup

try:
    import cloudscraper  # type: ignore
except Exception:
    cloudscraper = None

# ─────────────────────────────── Ayarlar ────────────────────────────────

BASE_URL = os.getenv("HDFC_BASE", "https://hdfilmcehennemi.la").rstrip("/")
MIRRORS = [
    BASE_URL,
    "https://hdfilmcehennemi.la",
    "https://www.hdfilmcehennemi.la",
    "https://www.hdfilmcehennemi.com",
    "https://www.hdfilmcehennemi.nl",
    "https://www.hdfilmcehennemi.ws",
    "https://hdfilmcehennemini.org",
    "https://hdfilmcehennemi.top",
    "https://hdfilmcehennemi.life",
]
MIRRORS = list(dict.fromkeys(MIRRORS))

MAX_PAGES = int(os.getenv("MAX_PAGES", "10"))
WORKERS = int(os.getenv("WORKERS", "6"))
ENRICH = os.getenv("ENRICH", "0") == "1"
ENRICH_LIMIT = int(os.getenv("ENRICH_LIMIT", "50"))
ENRICH_DELAY = float(os.getenv("ENRICH_DELAY", "0.35"))
DETAIL_WORKERS = max(1, int(os.getenv("DETAIL_WORKERS", "3")))
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

STATIC_LISTS = [
    ("Yeni Eklenenler",        "home",                                   "liste"),
    ("Tüm Filmler",            "categories/film-izle-2",                 "liste"),
    ("Vizyondaki Filmler",     "categories/vizyondaki-filmler",          "liste"),
    ("Nette İlk Filmler",      "categories/nette-ilk-filmler",           "liste"),
    ("Tavsiye Filmler",        "categories/tavsiye-filmler-izle2",       "liste"),
    ("IMDb 7+ Filmler",        "imdb7",                                  "liste"),
    ("En Çok Beğenilenler",    "mostLiked",                              "liste"),
    ("En Çok Yorumlananlar",   "mostCommented",                          "liste"),
    ("Popüler Diziler",        "home-series",                            "dizi"),
]

STATIC_GENRES = {
    "Aile":        ["aile-filmleri-izleyin-6", "aile-filmleri-izle-1"],
    "Aksiyon":     ["aksiyon-filmleri-izleyin-5", "aksiyon-filmleri-izleyin-3", "aksiyon-filmleri-izle-1"],
    "Animasyon":   ["animasyon-filmlerini-izleyin-5", "animasyon-filmlerini-izleyin-4", "animasyon-filmleri-izle-1"],
    "Belgesel":    ["belgesel-filmlerini-izle-1", "belgesel-filmleri-izle-2"],
    "Bilim Kurgu": ["bilim-kurgu-filmlerini-izleyin-3", "bilim-kurgu-filmlerini-izleyin-2", "bilim-kurgu-filmleri-izle-1"],
    "Biyografi":   ["biyografi-filmleri-izle-1", "biyografi-filmleri-izle-2"],
    "Dram":        ["dram-filmleri-izle-1", "dram-filmleri-izle-2"],
    "Fantastik":   ["fantastik-filmleri-izle-1", "fantastik-filmleri-izle-2"],
    "Gerilim":     ["gerilim-filmleri-izle-1", "gerilim-filmleri-izle-2"],
    "Gizem":       ["gizem-filmleri-izle-1", "gizem-filmleri-izle-2"],
    "Komedi":      ["komedi-filmlerini-izleyin-1", "komedi-filmleri-izle-2"],
    "Korku":       ["korku-filmlerini-izle-4", "korku-filmlerini-izle-2", "korku-filmleri-izle-1"],
    "Macera":      ["macera-filmleri-izle-1", "macera-filmleri-izle-2"],
    "Müzik":       ["muzik-filmleri-izle-1"],
    "Romantik":    ["romantik-filmleri-izle-2", "romantik-filmleri-izle-1"],
    "Savaş":       ["savas-filmleri-izle-1", "savas-filmleri-izle-2"],
    "Spor":        ["spor-filmleri-izle-1"],
    "Suç":         ["suc-filmleri-izle-3", "suc-filmleri-izle-1"],
    "Tarih":       ["tarih-filmleri-izle-4", "tarih-filmleri-izle-1"],
    "Western":     ["western-filmleri-izle-1"],
    "Polisiye":    ["polisiye-filmleri-izle-1"],
}

KESFET_YEARS = [str(y) for y in range(2026, 2017, -1)] + \
               ["2010-2017", "2000-2009", "1990-1999", "1901-1989"]
KESFET_IMDB = [("IMDb 9+", "9-10"), ("IMDb 8-9", "8-9"), ("IMDb 7-8", "7-8"),
               ("IMDb 6-7", "6-7")]

_log_lock = threading.Lock()

def log(msg: str) -> None:
    with _log_lock:
        print(msg, flush=True)

class Fetcher:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA})
        self.cs = cloudscraper.create_scraper() if cloudscraper else None
        self.active_base = BASE_URL
        self.strategy_stats: dict[str, int] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _blocked(text: str, status: int) -> bool:
        if status in (403, 429, 451, 503):
            return True
        head = (text or "")[:4000]
        return ("Just a moment" in head or "Bir dakika lütfen" in head or
                "cf-browser-verification" in head or "Yasal Nedenlerle" in head or
                "Please contact the site owner" in head or "Attention Required" in head)

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

    def get(self, path_or_url: str, *, api: bool = True, method: str = "GET",
            data=None, files=None, timeout: int = 4, retries: int = 0) -> str | None:
        headers = dict(API_HEADERS if api else PAGE_HEADERS)
        bases = [self.active_base] + [m for m in MIRRORS if m != self.active_base]
        absolute = path_or_url.startswith("http")

        for attempt in range(retries + 1):
            # 1) Direkt / mirror
            for base in ([None] if absolute else bases):
                url = path_or_url if absolute else f"{base}{path_or_url}"
                if not absolute:
                    headers["Referer"] = base + "/"
                text = self._try(self.session, url, headers, method, data, files, timeout)
                if text is not None:
                    if base and base != self.active_base:
                        log(f"↪ Aktif domain: {base}")
                        self.active_base = base
                    self._bump("direct")
                    return text

            # 2) Cloudscraper
            if self.cs is not None:
                url = path_or_url if absolute else f"{self.active_base}{path_or_url}"
                text = self._try(self.cs, url, headers, method, data, files, timeout)
                if text is not None:
                    self._bump("cloudscraper")
                    return text

            url = path_or_url if absolute else f"{self.active_base}{path_or_url}"

            # 3) ZenRows / ScraperAPI
            if method == "GET" and ZENROWS_API_KEY:
                zr = (f"https://api.zenrows.com/v1/?apikey={ZENROWS_API_KEY}&url=" +
                      quote(url, safe="") + "&custom_headers=true")
                text = self._try(self.session, zr, {"X-Requested-With": "fetch", "Referer": self.active_base + "/"},
                                 "GET", None, None, 45)
                if text is not None:
                    self._bump("zenrows")
                    return text

            if method == "GET" and SCRAPERAPI_KEY:
                sa = (f"https://api.scraperapi.com/?api_key={SCRAPERAPI_KEY}&keep_headers=true&url=" +
                      quote(url, safe=""))
                text = self._try(self.session, sa, headers, "GET", None, None, 45)
                if text is not None:
                    self._bump("scraperapi")
                    return text

            # 4) Google Translate
            if method == "GET":
                text = self._try(self.session, self._to_translate(url), headers, "GET", None, None, timeout)
                if text is not None:
                    self._bump("translate")
                    return self._clean_translate(text)

            time.sleep(1.0 * (attempt + 1))
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
                return "" if r.status_code == 404 else None
            return text
        except Exception:
            return None

    @staticmethod
    def _clean_translate(text: str) -> str:
        text = re.sub(r"https?://[a-z0-9-]+\.translate\.goog", BASE_URL, text)
        text = re.sub(r"[?&]_x_tr_[a-z]+=[^&\"'\s]*", "", text)
        return text

    def get_json(self, path: str, **kw):
        text = self.get(path, api=True, **kw)
        if not text:
            return None
        text = text.strip()
        try:
            return json.loads(text)
        except Exception:
            m = re.search(r"\{.*\}", text, re.S)
            if m:
                try:
                    return json.loads(m.group(0))
                except Exception:
                    pass
            if "<a" in text:
                return {"html": text}
        return None

fetcher = Fetcher()
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
        if sid in seen or ("/dizi/" in href and "/sezon" in href):
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

        cards.append({
            "id": sid,
            "title": re.sub(r"\s+", " ", title).replace(" izle", "").strip(),
            "href": href,
            "poster": poster,
            "imdb": imdb,
            "year": year,
            "type": "dizi" if "/dizi/" in href else "film",
        })
    return cards

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


def _text(soup: BeautifulSoup, selectors: str) -> str | None:
    el = soup.select_one(selectors)
    value = el.get_text(" ", strip=True) if el else ""
    return re.sub(r"\s+", " ", value).strip() or None


def _number(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", text)
    return float(m.group(0).replace(",", ".")) if m else None


def _same_or_allowed_frame(url: str) -> bool:
    """Allow only the site's public player hosts; do not follow nested frames."""
    try:
        host = (urlparse(url).hostname or "").lower().rstrip(".")
    except Exception:
        return False
    base_host = (urlparse(BASE_URL).hostname or "").lower().rstrip(".")
    return host == base_host or host.endswith(".hdfilmcehennemi.la") or host == "hdfilmcehennemi.mobi"


def parse_detail_page(html: str, page_url: str) -> dict:
    """Extract public metadata and visible iframe attributes only.

    This deliberately does not inspect iframe documents, scripts, packed code,
    HLS manifests, keys, tokens, or nested player requests.
    """
    soup = BeautifulSoup(html or "", "html.parser")
    title = _text(soup, "h1.section-title, .section-title, h1")
    if title:
        title = re.split(r"\s+izle\b", title, maxsplit=1, flags=re.I)[0].strip()

    year_country = [a.get_text(" ", strip=True) for a in soup.select(".post-info-year-country a")]
    year = next((int(x) for x in year_country if re.fullmatch(r"\d{4}", x)), None)
    country = next((x for x in year_country if not re.fullmatch(r"\d{4}", x)), None)
    genres = [a.get_text(" ", strip=True) for a in soup.select(".post-info-genres a") if a.get_text(strip=True)]
    cast = [a.get_text(" ", strip=True) for a in soup.select(".post-info-cast a") if a.get_text(strip=True)]

    iframes = []
    for frame in soup.select("iframe"):
        raw = frame.get("data-src") or frame.get("src")
        if not raw:
            continue
        src = urljoin(page_url, raw.strip())
        # Ignore blank/hidden utility frames and unrelated third-party frames.
        if not _same_or_allowed_frame(src):
            continue
        width = str(frame.get("width") or "").strip()
        height = str(frame.get("height") or "").strip()
        if width == "1" and height == "1":
            continue
        if not frame.get("class") and not frame.get("data-src") and not frame.get("src"):
            continue
        iframes.append({
            "type": "iframe",
            "src": src,
            "dataSrc": urljoin(page_url, frame.get("data-src")) if frame.get("data-src") else None,
            "className": " ".join(frame.get("class") or []),
            "title": frame.get("title"),
            "allow": frame.get("allow"),
            "allowFullscreen": frame.has_attr("allowfullscreen"),
        })

    return {
        "title": title,
        "originalTitle": _text(soup, ".original-title, .post-info-original-title"),
        "year": year,
        "country": country,
        "imdb": _number(_text(soup, ".post-info-imdb-rating span, .imdb")),
        "duration": _text(soup, ".post-info-duration"),
        "genres": genres,
        "description": _text(soup, "article.post-info-content > p, .post-info-content > p"),
        "poster": fix_url((soup.select_one("aside.post-info-poster img, .post-info-poster img") or {}).get("data-src") if soup.select_one("aside.post-info-poster img, .post-info-poster img") else None),
        "cast": cast,
        "iframes": iframes,
        "iframeStatus": "found" if iframes else "not_found",
        "detailFetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def enrich_card(card: dict) -> dict:
    """Fetch one public detail page and merge its metadata into a catalog card."""
    html = fetcher.get(card.get("href", ""), api=False, timeout=12, retries=1)
    if not html:
        return {**card, "iframeStatus": "fetch_failed", "iframes": []}
    detail = parse_detail_page(html, card["href"])
    merged = dict(card)
    for key in ("title", "originalTitle", "year", "country", "imdb", "duration", "genres", "description", "poster", "cast"):
        if detail.get(key):
            merged[key] = detail[key]
    merged["iframes"] = detail["iframes"]
    merged["iframeStatus"] = detail["iframeStatus"]
    merged["detailFetchedAt"] = detail["detailFetchedAt"]
    return merged


def enrich_catalog(limit: int = ENRICH_LIMIT) -> None:
    """Add public detail/iframe data to a bounded number of catalog records."""
    cards = list(catalog.movies.values())
    cards.sort(key=lambda m: ("Yeni Eklenenler" not in m.get("categories", []), m.get("title", "")))
    targets = cards[:max(0, limit)] if limit > 0 else cards
    if not targets:
        return
    log(f"🔎 Açık detay/iframe verisi okunuyor: {len(targets)} film (işçi: {DETAIL_WORKERS})")
    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as ex:
        futures = {ex.submit(enrich_card, card): card["id"] for card in targets}
        for future in as_completed(futures):
            sid = futures[future]
            try:
                updated = future.result()
                with catalog.lock:
                    catalog.movies[sid] = updated
            except Exception as exc:
                log(f"⚠ Detay alınamadı: {sid} ({exc})")
            time.sleep(ENRICH_DELAY)

def crawl_load_path(name: str, path: str, group: str, max_pages: int = MAX_PAGES) -> int:
    total = 0
    empty_streak = 0
    seen_pages: set[str] = set()
    for page in range(1, max_pages + 1):
        data = fetcher.get_json(f"/load/page/{page}/{path.strip('/')}/")
        if data is None:
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
        if sig in seen_pages:
            break
        seen_pages.add(sig)
        empty_streak = 0
        for c in cards:
            catalog.add(c, name, group)
        total += len(cards)
        if len(cards) < 12:
            break
        time.sleep(0.12)
    if total:
        log(f"✔ {name:<26} {total:>5} film  ({path})")
    return total

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
    log(f"   Domain: {BASE_URL} | İş Parçacığı: {WORKERS} | Maksimum Sayfa: {MAX_PAGES}")

    previous = load_previous()
    if previous:
        log(f"📦 Mevcut veritabanı: {len(previous)} film yüklendi")

    # 1) Statik ve tür listeleri
    tasks = []
    for name, path, group in STATIC_LISTS:
        tasks.append((name, path, group))
    for name, slugs in STATIC_GENRES.items():
        for s in slugs[:1]:
            tasks.append((name, f"genres/{s}", "tür"))

    # 2) Paralel tarama (canlı siteden)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(crawl_load_path, t[0], t[1], t[2]) for t in tasks]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception:
                pass

    # 3) Mevcut / zenginleştirilmiş veritabanı ile birleştir
    for sid, old in previous.items():
        cur = catalog.movies.get(sid)
        if cur is None:
            catalog.movies[sid] = old
            for c in old.get("categories", []):
                cat_info = catalog.categories.setdefault(c, {"name": c, "group": "tür", "count": 0})
                cat_info["count"] += 1
        else:
            for k, v in old.items():
                if k == "categories":
                    for cat in v:
                        if cat not in cur["categories"]:
                            cur["categories"].append(cat)
                elif not cur.get(k) and v:
                    cur[k] = v

    # 5) Ayrı ve isteğe bağlı aşama: herkese açık detay metadata + iframe attrs.
    #    iframe içeriği, script/manifest/key/token çözümlemesi yapılmaz.
    if ENRICH:
        enrich_catalog()

    # 6) Kategori sayaçlarını yeniden hesapla
    counts: dict[str, int] = {}
    for m in catalog.movies.values():
        for c in m.get("categories", []):
            counts[c] = counts.get(c, 0) + 1
    for name, n in counts.items():
        catalog.categories.setdefault(name, {"name": name, "group": "tür", "count": 0})["count"] = n

    movies = sorted(
        catalog.movies.values(),
        key=lambda m: ("Yeni Eklenenler" not in m.get("categories", []), -(m.get("year") or 0), m.get("title", ""))
    )

    group_order = {"liste": 0, "tür": 1, "yıl": 2, "imdb": 3, "dil": 4, "dizi": 5}
    cats = sorted(
        catalog.categories.values(),
        key=lambda c: (group_order.get(c.get("group", "tür"), 9), -c["count"], c["name"])
    )

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
        json.dump(out, f, ensure_ascii=False, indent=2)

    log("─" * 60)
    log(f"✅ Toplam {len(movies)} film ve {len(cats)} kategori '{OUT_FILE}' dosyasına kaydedildi.")
    log(f"⏱  Tamamlanma süresi: {time.time() - t0:.1f} saniye")
    return 0

if __name__ == "__main__":
    sys.exit(main())
