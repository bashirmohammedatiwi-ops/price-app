# Price App - Domain Deployment (Nginx)

هذا المشروع يعمل الآن عبر دومين واحد باستخدام Nginx (بدون Caddy):

- `https://deemaalhayaprice.online/` تطبيق المستخدم (بحث باركود + ماسح كاميرا)
- `https://deemaalhayaprice.online/admin` لوحة التحكم
- `https://deemaalhayaprice.online/api/health` API الصحة

## تشغيل محلي سريع

### Backend

```bash
cd backend
npm install
npm run dev
```

### Admin Web

```bash
cd web/admin
npm install
npm run dev
```

### Client Web

```bash
cd web/client
npm install
npm run dev
```

## Docker Compose (الخدمات الداخلية)

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

المنافذ بعد التشغيل:
- Backend: `5000`
- Admin Web: `5001`
- Client Web: `5002`

## متطلبات الدومين

- سجّل A Record للدومين `deemaalhayaprice.online` إلى IP السيرفر.
- افتح المنافذ `80` و `443` في الجدار الناري.
- ثبّت Nginx + Certbot على السيرفر.

## إعداد Nginx للدومين

الملف الجاهز موجود في:

- `deploy/nginx/deemaalhayaprice.online.conf`

خطوات التفعيل:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

sudo cp deploy/nginx/deemaalhayaprice.online.conf /etc/nginx/sites-available/deemaalhayaprice.online.conf
sudo ln -s /etc/nginx/sites-available/deemaalhayaprice.online.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d deemaalhayaprice.online
sudo systemctl reload nginx
```

## ملاحظات

- الواجهتان تستخدمان API داخليًا على المسار `/api` تلقائيًا (بدون إعداد يدوي).
- بعد إعداد Nginx:
  - `https://deemaalhayaprice.online/` للتطبيق
  - `https://deemaalhayaprice.online/admin` للوحة التحكم
