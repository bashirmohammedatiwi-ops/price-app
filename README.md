# Price App - Domain Deployment (Nginx)

هذا المشروع يعمل الآن على نفس الدومين الرئيسي عبر امتدادات (paths):

- `https://demaalhayaadelivery.online/price/` تطبيق المستخدم (بحث باركود + ماسح كاميرا)
- `https://demaalhayaadelivery.online/price-admin/` لوحة التحكم
- `https://demaalhayaadelivery.online/price-api/health` API الصحة

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

## إعداد الدومين مع Proxy موجود مسبقًا (موصى به لسيرفرك)

إذا كان عندك container يملك `80/443` مثل `delivery-nginx`، لا تشغل Nginx ثاني.
استخدم السكربت التالي لحقن path routing داخل نفس الـ proxy تلقائيًا:

```bash
cd ~/price-app
docker compose up -d --build
./deploy/nginx/apply_to_existing_proxy.sh demaalhayaadelivery.online delivery-nginx
```

هذا يحل الربط فورًا بدون إيقاف بقية المشاريع.

## إعداد Nginx للدومين (في حال لا يوجد Proxy آخر)

الملف الجاهز موجود في:

- `deploy/nginx/deemaalhayaprice.online.conf`
- `deploy/nginx/install_domain.sh`
- `deploy/nginx/apply_to_existing_proxy.sh`

### تنفيذ آلي (مستحسن)

```bash
cd ~/price-app
./deploy/nginx/install_domain.sh deemaalhayaprice.online admin@deemaalhayaprice.online
```

## ملاحظات

- الواجهتان تستخدمان API داخليًا على المسار `/api` تلقائيًا (بدون إعداد يدوي).
- بعد تطبيق السكربت على proxy الرئيسي:
  - `https://demaalhayaadelivery.online/price/` للتطبيق
  - `https://demaalhayaadelivery.online/price-admin/` للوحة التحكم
  - `https://demaalhayaadelivery.online/price-api/health` للـ API
- السكربت يعدل هذا الدومين فقط ولا يعطل المواقع الأخرى.
