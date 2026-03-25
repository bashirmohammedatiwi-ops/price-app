import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class BackendUrlProvider {
  const BackendUrlProvider();

  static const String _prefsKey = 'backend_url';

  String _defaultBaseUrl() {
    // Works well for Android Emulator.
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3001';
    }

    // For iOS/macOS simulators/local dev.
    if (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS) {
      return 'http://localhost:3001';
    }

    // Web/others.
    return 'http://localhost:3001';
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

