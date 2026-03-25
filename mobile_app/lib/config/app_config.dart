class AppConfig {
  // You can override this at build time:
  // flutter run --dart-define=BACKEND_URL=http://<host>:3001
  static const String backendBaseUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: 'http://localhost:3001',
  );
}

