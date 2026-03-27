import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/domain/models/product.dart';

class ProductCache {
  static const String _key = 'product_cache_map_v1';

  const ProductCache();

  Future<Product?> getByBarcode(String barcode) async {
    final value = barcode.trim();
    if (value.isEmpty) return null;

    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return null;

    try {
      final map = json.decode(raw) as Map<String, dynamic>;
      final item = map[value];
      if (item is Map<String, dynamic>) {
        return Product.fromJson(item);
      }
      if (item is Map) {
        return Product.fromJson(item.cast<String, dynamic>());
      }
    } catch (_) {
      // Ignore malformed cache.
    }
    return null;
  }

  Future<void> put(Product product) async {
    final barcode = product.barcode.trim();
    if (barcode.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    Map<String, dynamic> map = <String, dynamic>{};
    if (raw != null && raw.isNotEmpty) {
      try {
        map = (json.decode(raw) as Map).cast<String, dynamic>();
      } catch (_) {
        map = <String, dynamic>{};
      }
    }

    map[barcode] = _toJson(product);
    await prefs.setString(_key, json.encode(map));
  }

  Map<String, dynamic> _toJson(Product product) {
    return {
      'barcode': product.barcode,
      'name': product.name,
      'sources': product.sources
          .map(
            (s) => {
              'source': s.source,
              'price': s.price,
              'fields': s.fields,
              'updated_at': s.updatedAt,
            },
          )
          .toList(),
    };
  }
}
