from curl_cffi import requests
from bs4 import BeautifulSoup
import json
import os

URL = 'https://www.hdfilmcehennemi.nl/load/page/1/home/'

print("Bot çalıştırıldı, ZenRows iptal edildi. Gerçek Chrome taklidi yapılıyor...")

try:
    # impersonate="chrome110" parametresi sihirli kelimedir. 
    # Cloudflare'i gerçek bir insan tarayıcısı olduğuna inandırır.
    response = requests.get(URL, impersonate="chrome110")
    
    # Gelen veri JSON da olabilir düz HTML de olabilir
    try:
        data = response.json()
        html = data.get('html', response.text)
    except:
        html = response.text

    soup = BeautifulSoup(html, 'html.parser')
    movies = []

    for a in soup.find_all('a'):
        title = a.get('title')
        href = a.get('href')
        img = a.find('img')
        
        if img:
            poster = img.get('data-src') or img.get('src')
            if title and href and poster:
                title = title.strip()
                movies.append({'title': title, 'href': href, 'poster': poster})

    if movies:
        # public klasörünü oluştur ve json dosyasını kaydet
        os.makedirs('public', exist_ok=True)
        with open('public/movies.json', 'w', encoding='utf-8') as f:
            json.dump({'movies': movies}, f, ensure_ascii=False, indent=2)
        print(f"BAŞARILI: {len(movies)} film public/movies.json dosyasına kaydedildi.")
    else:
        print("HATA: Site aşıldı ama film kartları bulunamadı.")
        print("Gelen HTML:", html[:500])
        
except Exception as e:
    print(f"KRİTİK HATA: {e}")
