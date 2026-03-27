import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile_app/config/backend_url_provider.dart';
import 'package:mobile_app/domain/models/product.dart';
import 'package:mobile_app/domain/product_not_found_exception.dart';

class ProductApiClient {
  final BackendUrlProvider backendUrlProvider;

  const ProductApiClient({
    required this.backendUrlProvider,
  });

  Future<Product> getProductByBarcode(String barcode) async {
    final baseUrl = await backendUrlProvider.getBaseUrl();
    final url = '$baseUrl/product/${Uri.encodeComponent(barcode)}';
    final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 20));

    if (res.statusCode == 404) {
      throw ProductNotFoundException(barcode);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Request failed (${res.statusCode})');
    }

    final jsonMap = json.decode(res.body) as Map<String, dynamic>;
    return Product.fromJson(jsonMap);
  }
}
