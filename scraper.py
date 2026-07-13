import requests
from bs4 import BeautifulSoup
import json
import os

ZENROWS_API_KEY = '9f12e290f53e489c5b15b92dd18d6136f39d483b'
URL = 'https://www.hdfilmcehennemi.nl/load/page/1/home/'

print("Bot çalıştırıldı, siteye bağlanılıyor...")

proxy_url = f"https://api.zenrows.com/v1/?apikey={ZENROWS_API_KEY}&url={URL}&mode=auto"

try:
    response = requests.get(proxy_url)
    response.raise_for_status()
    
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
                movies.append({'title': title, 'href': href, 'poster': poster})

    if movies:
        # public klasörünü oluştur ve json dosyasını kaydet
        os.makedirs('public', exist_ok=True)
        with open('public/movies.json', 'w', encoding='utf-8') as f:
            json.dump({'movies': movies}, f, ensure_ascii=False, indent=2)
        print(f"BAŞARILI: {len(movies)} film public/movies.json dosyasına kaydedildi.")
    else:
        print("HATA: Film kartları bulunamadı.")
except Exception as e:
    print(f"KRİTİK HATA: {e}")
