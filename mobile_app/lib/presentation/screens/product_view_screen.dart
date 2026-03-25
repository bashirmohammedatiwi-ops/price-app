import 'package:flutter/material.dart';

import 'package:mobile_app/domain/models/product.dart';
import 'package:mobile_app/data/repositories/product_repository.dart';
import 'package:mobile_app/config/backend_url_provider.dart';
import 'package:mobile_app/presentation/widgets/backend_url_dialog.dart';
import 'package:mobile_app/config/ui_tokens.dart';

class ProductViewScreen extends StatefulWidget {
  final String barcode;
  final ProductRepository repository;
  final BackendUrlProvider backendUrlProvider;

  const ProductViewScreen({
    super.key,
    required this.barcode,
    required this.repository,
    required this.backendUrlProvider,
  });

  @override
  State<ProductViewScreen> createState() => _ProductViewScreenState();
}

class _ProductViewScreenState extends State<ProductViewScreen> {
  late Future<ProductFetchResult> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.getProduct(widget.barcode);
  }

  Future<void> _refresh() async {
    setState(() {
      _future = widget.repository.getProduct(widget.barcode);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('عرض المنتج'),
        actions: [
          IconButton(
            tooltip: 'تحديث',
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
          ),
        ],
      ),
      body: FutureBuilder<ProductFetchResult>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'تعذر الاتصال بالسيرفر. تحقق من رابط `Backend`.',
                      style: TextStyle(color: Colors.red, fontWeight: FontWeight.w700),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 10),
                    Container(
                      constraints: const BoxConstraints(maxWidth: 520),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _withAlpha(Colors.red, 0.06),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        snapshot.error.toString(),
                        maxLines: 5,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.black87, fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 10,
                      alignment: WrapAlignment.center,
                      children: [
                        OutlinedButton(
                          onPressed: () async {
                            await showDialog(
                              context: context,
                              builder: (context) => BackendUrlDialog(provider: widget.backendUrlProvider),
                            );
                            _refresh();
                          },
                          child: const Text('تعديل رابط السيرفر'),
                        ),
                        ElevatedButton(
                          onPressed: _refresh,
                          child: const Text('إعادة المحاولة'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }

          final result = snapshot.data;
          if (result == null) {
            return const Center(child: Text('لا توجد بيانات'));
          }

          final product = result.product;
          final sources = [...product.sources]..sort((a, b) => a.price.compareTo(b.price));
          if (sources.isEmpty) {
            return Center(
              child: Text(
                'لا توجد أسعار لهذا الباركود: ${product.barcode}',
                textAlign: TextAlign.center,
              ),
            );
          }

          final cheapest = sources.first;

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (result.fromCache)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _withAlpha(Colors.orange, 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'تم تحميل البيانات من الكاش (Offline Cache)',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                const SizedBox(height: 12),
                _buildProductHeader(context, product, cheapest),
                const SizedBox(height: 16),
                const Text(
                  'المصادر (الأرخص أولاً)',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                ...sources.map((s) => _buildSourceCard(context, s, cheapest)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildProductHeader(BuildContext context, Product product, ProductSource cheapest) {
    final name = product.name ?? 'بدون اسم';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: UiTokens.headerGradient(),
      ),
      child: Card(
        elevation: 0,
        color: UiTokens.alpha(Colors.white, 0.78),
        shadowColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: UiTokens.alpha(Colors.white, 0.6)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [UiTokens.primary, UiTokens.accent],
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text(
                          'الأرخص',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          cheapest.price.toStringAsFixed(2),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 22,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'الباركود: ${product.barcode}',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: UiTokens.textSecondary,
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(Icons.shopping_bag_outlined, color: UiTokens.textSecondary, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'المصدر الأرخص: ${cheapest.source}',
                      style: TextStyle(
                        color: UiTokens.textSecondary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSourceCard(BuildContext context, ProductSource s, ProductSource cheapest) {
    final diff = s.price - cheapest.price;
    final isCheapest = s.source == cheapest.source && diff == 0;
    final diffText = isCheapest
        ? 'الأرخص'
        : diff == 0
            ? 'مساوي للأرخص'
            : 'فرق السعر: ${diff.toStringAsFixed(2)}';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(1.6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: isCheapest
            ? LinearGradient(
                colors: [
                  UiTokens.alpha(UiTokens.success, 0.25),
                  UiTokens.alpha(UiTokens.accent, 0.18),
                ],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              )
            : null,
        border: Border.all(
          color: isCheapest ? UiTokens.alpha(UiTokens.success, 0.55) : Colors.black12,
          width: isCheapest ? 1.6 : 1,
        ),
      ),
      child: Stack(
        children: [
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              color: Colors.white,
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          s.source,
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            s.price.toStringAsFixed(2),
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            diffText,
                            style: TextStyle(
                              fontSize: 12,
                              color: isCheapest ? UiTokens.success : UiTokens.textSecondary,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (s.fields.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 8,
                      children: s.fields.entries
                          .map((e) => _FieldPill(label: e.key.toString(), value: e.value.toString()))
                          .toList(),
                    ),
                  ],
                  if (s.fields.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 10),
                      child: Text(
                        'لا توجد تفاصيل إضافية',
                        style: TextStyle(color: Colors.black54, fontWeight: FontWeight.w700),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (isCheapest)
            Positioned(
              left: 12,
              top: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [UiTokens.success, UiTokens.accent],
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'الأرخص',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FieldPill extends StatelessWidget {
  final String label;
  final String value;

  const _FieldPill({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: _withAlpha(Colors.black, 0.04),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$label: $value',
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

Color _withAlpha(Color color, double alpha) {
  final a = (alpha.clamp(0, 1) * 255).round();
  final v = color.toARGB32();
  final r = (v >> 16) & 0xFF;
  final g = (v >> 8) & 0xFF;
  final b = v & 0xFF;
  return Color.fromARGB(a, r, g, b);
}

