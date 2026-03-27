import 'package:mobile_app/data/api/product_api_client.dart';
import 'package:mobile_app/data/local/product_cache.dart';
import 'package:mobile_app/domain/models/product.dart';
import 'package:mobile_app/domain/product_not_found_exception.dart';

class ProductFetchResult {
  final Product product;
  final bool fromCache;

  const ProductFetchResult({
    required this.product,
    required this.fromCache,
  });
}

class ProductRepository {
  final ProductApiClient apiClient;
  final ProductCache cache;

  const ProductRepository({
    required this.apiClient,
    required this.cache,
  });

  Future<ProductFetchResult> getProduct(String barcode) async {
    try {
      final product = await apiClient.getProductByBarcode(barcode);
      await cache.put(product);
      return ProductFetchResult(product: product, fromCache: false);
    } on ProductNotFoundException {
      rethrow;
    } catch (_) {
      final cached = await cache.getByBarcode(barcode);
      if (cached != null) {
        return ProductFetchResult(product: cached, fromCache: true);
      }
      rethrow;
    }
  }
}
