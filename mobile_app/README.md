# سعر (Flutter) - تجهيز iOS

## تشغيل سريع

```bash
cd mobile_app
flutter pub get
flutter run
```

## تجهيز iOS للرفع (TestFlight / App Store)

### 1) افتح مشروع iOS في Xcode

```bash
cd mobile_app
open ios/Runner.xcworkspace
```

### 2) إعدادات Xcode المطلوبة

داخل Xcode:
- **Runner** → **Signing & Capabilities**
  - اختر **Team**
  - فعّل **Automatically manage signing**
- **Runner** → **General**
  - حدّد **Bundle Identifier** (مثال: `com.yourcompany.priceapp`)
  - تأكد من **Version** و **Build** (من `pubspec.yaml`)

### 3) بناء نسخة iOS (بدون توقيع للتأكد فقط)

```bash
flutter clean
flutter pub get
flutter build ios --release --no-codesign
```

### 4) بناء IPA للرفع (يحتاج توقيع صحيح)

```bash
flutter build ipa --release
```

بعد البناء ستجد الملف عادة في:
`build/ios/ipa/`

### 5) الرفع إلى TestFlight

الأسهل:
- من Xcode: **Product → Archive** ثم **Distribute App**

أو باستخدام Transporter (من App Store) لرفع الـ `.ipa`.

## أذونات الكاميرا

تم إضافة:
- `NSCameraUsageDescription` في `ios/Runner/Info.plist`

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
