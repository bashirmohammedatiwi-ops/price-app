import 'package:flutter/material.dart';

import 'package:mobile_app/data/api/product_api_client.dart';
import 'package:mobile_app/data/local/product_cache.dart';
import 'package:mobile_app/data/local/recent_scans_cache.dart';
import 'package:mobile_app/data/repositories/product_repository.dart';
import 'package:mobile_app/config/backend_url_provider.dart';
import 'package:mobile_app/config/ui_tokens.dart';
import 'package:mobile_app/presentation/screens/scanner_screen.dart';
import 'package:mobile_app/presentation/screens/product_view_screen.dart';

class BarcodeInputScreen extends StatefulWidget {
  const BarcodeInputScreen({super.key});

  @override
  State<BarcodeInputScreen> createState() => _BarcodeInputScreenState();
}

class _BarcodeInputScreenState extends State<BarcodeInputScreen> {
  final _controller = TextEditingController();
  late final RecentScansCache _recentCache;

  @override
  void initState() {
    super.initState();
    _recentCache = const RecentScansCache();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('قراءة الباركود'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: UiTokens.headerGradient(),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Card(
                  elevation: 0,
                  color: UiTokens.alpha(Colors.white, 0.72),
                  shadowColor: Colors.transparent,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                    side: BorderSide(color: UiTokens.alpha(Colors.white, 0.65)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Icon(Icons.qr_code_scanner, color: theme.colorScheme.primary, size: 26),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                'أدخل الباركود أو امسحه',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 16,
                                  color: UiTokens.textPrimary,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: UiTokens.alpha(Colors.black, 0.05),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                'سريع',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: UiTokens.textSecondary,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _controller,
                          decoration: const InputDecoration(
                            labelText: 'الباركود',
                            hintText: 'مثال: 1234567890',
                          ),
                          textInputAction: TextInputAction.done,
                          keyboardType: TextInputType.number,
                          onSubmitted: (_) => _onSubmit(),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: FilledButton(
                                onPressed: _onSubmit,
                                style: FilledButton.styleFrom(
                                  backgroundColor: UiTokens.primary,
                                  foregroundColor: Colors.white,
                                ),
                                child: const Text('عرض المنتج'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: FilledButton.tonal(
                                onPressed: () {
                                  if (!mounted) return;
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (context) => const ScannerScreen(),
                                    ),
                                  );
                                },
                                child: const Text('ماسح'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: FutureBuilder<List<String>>(
                  future: _recentCache.getRecentBarcodes(),
                  builder: (context, snapshot) {
                    final items = snapshot.data ?? const [];
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (items.isEmpty) {
                      return Center(
                        child: Text(
                          'لا توجد عمليات بحث حديثة بعد.',
                          style: theme.textTheme.bodyMedium?.copyWith(color: Colors.black54),
                        ),
                      );
                    }

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(bottom: 10),
                          child: Text(
                            'أحدث عمليات البحث',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
                          ),
                        ),
                        SizedBox(
                          height: 54,
                          child: ListView.separated(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            scrollDirection: Axis.horizontal,
                            itemCount: items.length,
                            separatorBuilder: (context, index) => const SizedBox(width: 10),
                            itemBuilder: (context, idx) {
                              final bc = items[idx];
                              return InkWell(
                                borderRadius: BorderRadius.circular(999),
                                onTap: () => _openProduct(bc),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                  decoration: BoxDecoration(
                                    gradient: UiTokens.headerGradient(),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    bc,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 12,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'اضغط على أي باركود لعرض المنتج مباشرة.',
                          style: theme.textTheme.bodySmall?.copyWith(color: UiTokens.textSecondary),
                        ),
                      ],
                    );
                  },
                ),
              ),
              const SizedBox(height: 10),
              TextButton.icon(
                onPressed: () async {
                  await _recentCache.clearRecentBarcodes();
                  if (!mounted) return;
                  setState(() {});
                },
                icon: const Icon(Icons.delete_outline),
                label: const Text('حذف سجل البحث'),
              )
            ],
          ),
        ),
      ),
    );
  }

  void _openProduct(String barcode) {
    const backendUrlProvider = BackendUrlProvider();
    final repo = ProductRepository(
      apiClient: const ProductApiClient(backendUrlProvider: backendUrlProvider),
      cache: const ProductCache(),
    );

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ProductViewScreen(
          barcode: barcode,
          repository: repo,
          backendUrlProvider: backendUrlProvider,
        ),
      ),
    );
  }

  void _onSubmit() {
    final barcode = _controller.text.trim();
    if (barcode.isEmpty) return;
    // Save recent scans (best-effort) then navigate.
    _recentCache.addBarcode(barcode);
    _openProduct(barcode);
  }
}

