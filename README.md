# Price App - Web Split

هذا المشروع يعمل الآن بواجهتين ويب منفصلتين:

- `web/admin`: لوحة تحكم الاستيراد وColumn Mapping.
- `web/client`: تطبيق ويب للمستخدم (بحث باركود + ماسح كاميرا).

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

## Docker Compose

```bash
docker compose up -d --build
docker compose ps
```

المنافذ:

- Backend: `http://localhost:5000`
- Admin Web: `http://localhost:5001`
- Client Web: `http://localhost:5002`

## متغيرات البيئة للويب

- `VITE_BACKEND_URL` لتحديد عنوان الـ API إذا أردت override.
- افتراضياً في الواجهتين: `http://<نفس-الدومين-أو-IP>:5000`.
