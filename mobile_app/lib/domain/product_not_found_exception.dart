/// Thrown when the backend returns 404 for [barcode].
class ProductNotFoundException implements Exception {
  final String barcode;

  const ProductNotFoundException(this.barcode);

  @override
  String toString() => 'Product not found';
}
