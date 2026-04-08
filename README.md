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

### لماذا يعمل على IP ولا يعمل على الدومين؟

- **الدومين** يمر عبر Nginx تطبيق التوصيل (أو أي reverse proxy) على `80/443`؛ بدون قواعد `/price/` و`/price-api/` يذهب كل شيء لتطبيق التوصيل أو لـ `location /`.
- **الـ IP مع منفذ** (مثل `http://IP:5002/price/`) يصل مباشرة لحاويات مشروع الأسعار دون ذلك الـ proxy، فيبدو أن «كل شيء يعمل» بينما الدومين معطوب.

### بعد تحديث أو إعادة نشر تطبيق التوصيل (مهم)

عند تحديث مشروع التوصيل على [demaalhayaadelivery.online](https://demaalhayaadelivery.online/) غالبًا ما يُعاد **بناء حاوية Nginx** أو يُستبدل محتوى `/etc/nginx/conf.d/`، فيُحذف:

1. الملف `price-app-paths.inc` الذي يُنسخ بالسكربت، و/أو  
2. سطر `include /etc/nginx/conf.d/price-app-paths.inc;` داخل كتلة `server` للدومين.

**بعد كل deploy للتوصيل** شغّل مرة أخرى (بعد التأكد أن مشروع الأسعار يعمل بـ `docker compose`):

```bash
cd ~/price-app
docker compose up -d
./deploy/nginx/apply_to_existing_proxy.sh demaalhayaadelivery.online delivery-nginx
```

على السيرفر يجب تثبيت **`python3`** (يُستخدم لإدراج سطر `include` تلقائياً داخل كتلة `server` الصحيحة، غالباً `listen 443`). إن لم يكن مثبتاً: `apt install -y python3`.

إذا كان `server_name` يستخدم متغيراً مثل `${DOMAIN}` وليس اسم الدومين حرفياً، السكربت يعتمد على أسطر **`ssl_certificate`** / **`ssl_certificate_key`** (مسار Let’s Encrypt) لمعرفة الكتلة الصحيحة.

تحقق: `curl -sS https://demaalhayaadelivery.online/price-api/health` يجب أن يعيد `{"ok":true}` وليس HTML صفحة التوصيل.

**حل أدوم:** أضف في **قالب nginx لمشروع التوصيل** (الذي يُبنى مع الصورة) سطرًا ثابتًا:

`include /etc/nginx/conf.d/price-app-paths.inc;`

داخل كتلة `server` لـ `demaalhayaadelivery.online`، ثم اجعل السكربت أعلاه يحدّث الملف `price-app-paths.inc` فقط بعد كل تحديث — حتى لا تضطر لإعادة حقن سطر الـ `include` يدويًا.

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
