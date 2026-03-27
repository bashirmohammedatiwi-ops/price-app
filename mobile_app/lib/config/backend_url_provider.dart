import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class BackendUrlProvider {
  const BackendUrlProvider();

  static const String _prefsKey = 'backend_url';

  String _defaultBaseUrl() {
    // Flutter Web: same origin as الصفحة (مثال: /price-api بجانب /price/flutter-web/).
    if (kIsWeb) {
      final origin = Uri.base.origin;
      return '$origin/price-api';
    }

    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://187.124.23.65:5000';
    }

    if (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS) {
      return 'http://187.124.23.65:5000';
    }

    return 'http://187.124.23.65:5000';
  }

  Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefsKey);
    final base = (saved == null || saved.trim().isEmpty) ? _defaultBaseUrl() : saved.trim();
    return _normalize(base);
  }

  Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    final base = _normalize(url);
    await prefs.setString(_prefsKey, base);
  }

  String _normalize(String url) {
    var u = url.trim();
    // Ensure it's a http(s) URL.
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'http://$u';
    }
    // Remove trailing slash to keep URLs consistent.
    if (u.endsWith('/')) u = u.substring(0, u.length - 1);
    return u;
  }
}

