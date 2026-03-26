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
- `deploy/nginx/install_domain.sh`

### تنفيذ آلي (مستحسن)

```bash
cd ~/price-app
./deploy/nginx/install_domain.sh deemaalhayaprice.online admin@deemaalhayaprice.online
```

## ملاحظات

- الواجهتان تستخدمان API داخليًا على المسار `/api` تلقائيًا (بدون إعداد يدوي).
- بعد إعداد Nginx:
  - `https://deemaalhayaprice.online/` للتطبيق
  - `https://deemaalhayaprice.online/admin` للوحة التحكم
- السكربت يعدل هذا الدومين فقط ولا يعطل المواقع الأخرى.
