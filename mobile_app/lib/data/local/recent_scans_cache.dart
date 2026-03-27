import 'package:shared_preferences/shared_preferences.dart';

class RecentScansCache {
  static const String _key = 'recent_scans_cache';
  static const int _maxItems = 20;

  const RecentScansCache();

  Future<List<String>> getRecentBarcodes() async {
    final prefs = await SharedPreferences.getInstance();
    final items = prefs.getStringList(_key) ?? const <String>[];
    return List<String>.from(items);
  }

  Future<void> addBarcode(String barcode) async {
    final value = barcode.trim();
    if (value.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    final current = prefs.getStringList(_key) ?? <String>[];
    final next = <String>[value, ...current.where((e) => e != value)].take(_maxItems).toList();
    await prefs.setStringList(_key, next);
  }

  Future<void> clearRecentBarcodes() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
