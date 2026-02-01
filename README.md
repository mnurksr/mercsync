# ShopiAuto - Pazar Odaklı Otomasyon Sistemi

Bu proje, "ShopiAuto Mühendislik Manifestosu" raporuna uygun olarak hazırlanmış teknik altyapıyı içerir.

## 📁 Proje Yapısı

- `supabase/migrations/`: Veritabanı kurulum dosyaları.
  - `0001_initial_schema.sql`: Tablolar (Items, Locations, Levels, Ledger).
  - `0002_rpc_functions.sql`: Atomik stok rezervasyon fonksiyonları (`reserve_inventory`).
  - `0003_rls_security.sql`: RLS politikaları.
  - `0004_anomaly_detection.sql`: Anomali tespiti için SQL görünümleri.
- `n8n/`: Otomasyon rehberleri ve scriptler.
  - `rate_limit.lua`: Redis için Leaky Bucket algoritması.
  - `WORKFLOW_GUIDE.md`: n8n iş akışlarını kurma rehberi.
- `frontend/`: Next.js tabanlı Realtime Dashboard.
- `docker-compose.yml`: n8n (Queue Mode) ve Redis'i yerel çalıştırmak için konfigürasyon.

## 🚀 Kurulum Adımları

### 1. Veritabanı (Supabase)
1. Bir [Supabase](https://supabase.com) projesi oluşturun.
2. SQL Editor'ü açın.
3. `supabase/migrations/` içindeki dosyaları sırasıyla (0001 -> 0004) kopyalayıp çalıştırın.

### 2. Otomasyon (n8n & Redis)
Terminalde ana dizindeyken:
```bash
docker-compose up -d
```
n8n arayüzüne `http://localhost:5678` adresinden erişin (Kullanıcı: admin / Şifre: password).
`n8n/WORKFLOW_GUIDE.md` dosyasındaki adımları izleyerek iş akışlarını oluşturun.

### 3. Frontend (Dashboard)
1. `frontend` klasörüne gidin:
   ```bash
   cd frontend
   ```
2. `.env.local` dosyasını düzenleyin ve Supabase URL/ANON KEY bilgilerinizi girin.
3. Uygulamayı başlatın:
   ```bash
   npm run dev
   ```
4. `http://localhost:3000` adresinden dashboard'u görüntüleyin.

## ⚠️ Uyarılar
- Bu bir başlangıç kurulumudur (boilerplate). Prodüksiyon için Supabase şifrelerini ve Docker ortam değişkenlerini güçlendirmeyi unutmayın.
- n8n Workflowları manuel oluşturulmalıdır, rehberi takip edin.
