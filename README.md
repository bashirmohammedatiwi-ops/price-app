# Price App - Domain Deployment

هذا المشروع يعمل الآن عبر دومين واحد:

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

## Docker Compose (الإنتاج عبر الدومين)

```bash
docker compose up -d --build
docker compose ps
```

الـ gateway (Caddy) ينشر:
- `80` و `443` فقط (HTTP/HTTPS)

## متطلبات الدومين

- سجّل A Record للدومين `deemaalhayaprice.online` إلى IP السيرفر.
- افتح المنافذ `80` و `443` في الجدار الناري.
- Caddy سيصدر شهادة HTTPS تلقائيًا.

## ملاحظات

- الواجهتان تستخدمان API داخليًا على المسار `/api` تلقائيًا (بدون إعداد يدوي).
- إذا أردت تشغيل محلي بدون دومين، يمكن استخدام:
  - `http://localhost/` للتطبيق
  - `http://localhost/admin` للوحة التحكم
