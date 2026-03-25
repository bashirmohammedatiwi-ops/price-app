class Product {
  final String barcode;
  final String? name;
  final List<ProductSource> sources;

  const Product({
    required this.barcode,
    required this.name,
    required this.sources,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    final sourcesJson = (json['sources'] as List?) ?? [];
    return Product(
      barcode: (json['barcode'] ?? '').toString(),
      name: json['name'] == null ? null : (json['name'] as Object).toString(),
      sources: sourcesJson
          .map((e) => ProductSource.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ProductSource {
  final String source;
  final double price;
  final Map<String, dynamic> fields;
  final String updatedAt;

  const ProductSource({
    required this.source,
    required this.price,
    required this.fields,
    required this.updatedAt,
  });

  factory ProductSource.fromJson(Map<String, dynamic> json) {
    final p = json['price'];
    final price = p is num ? p.toDouble() : double.tryParse(p?.toString() ?? '') ?? 0;
    final fieldsJson = (json['fields'] as Map?) ?? <String, dynamic>{};
    return ProductSource(
      source: (json['source'] ?? '').toString(),
      price: price,
      fields: fieldsJson.cast<String, dynamic>(),
      updatedAt: (json['updated_at'] ?? '').toString(),
    );
  }
}

