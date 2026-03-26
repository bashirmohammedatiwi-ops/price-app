import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'package:mobile_app/data/api/product_api_client.dart';
import 'package:mobile_app/data/local/product_cache.dart';
import 'package:mobile_app/data/local/recent_scans_cache.dart';
import 'package:mobile_app/data/repositories/product_repository.dart';
import 'package:mobile_app/presentation/screens/product_view_screen.dart';
import 'package:mobile_app/config/backend_url_provider.dart';
import 'package:mobile_app/config/ui_tokens.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> with SingleTickerProviderStateMixin {
  final _scannerController = MobileScannerController();
  bool _isNavigating = false;
  late final AnimationController _scanAnimation;

  @override
  void initState() {
    super.initState();
    _scanAnimation = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: false);
  }

  @override
  void dispose() {
    _scanAnimation.dispose();
    _scannerController.dispose();
    super.dispose();
  }

  Future<void> _handleBarcode(String? rawValue) async {
    if (!mounted) return;
    if (_isNavigating) return;

    final barcode = rawValue?.trim();
    if (barcode == null || barcode.isEmpty) return;

    setState(() => _isNavigating = true);

    try {
      // Best-effort: stop camera to avoid repeated detections.
      await _scannerController.stop();
    } catch (_) {
      // Ignore and still navigate.
    }

    // Best-effort: save to recent history (do not block navigation).
    try {
      const recentCache = RecentScansCache();
      await recentCache.addBarcode(barcode);
    } catch (_) {}

    final repo = ProductRepository(
      apiClient: const ProductApiClient(backendUrlProvider: BackendUrlProvider()),
      cache: const ProductCache(),
    );

    if (!mounted) return;
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    // Navigate after current frame to avoid "setState during build" edge cases.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      try {
        nav.pushReplacement(
          MaterialPageRoute(
            builder: (context) => ProductViewScreen(
              barcode: barcode,
              repository: repo,
              backendUrlProvider: const BackendUrlProvider(),
            ),
          ),
        );
      } catch (e) {
        if (!mounted) return;
        setState(() => _isNavigating = false);
        _scannerController.start().catchError((_) {});
        messenger.showSnackBar(
          SnackBar(
            content: Text('تعذر فتح نتيجة الباركود: ${e.toString()}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final frameWidth = mq.size.width * 0.78;
    final frameHeight = mq.size.height * 0.36;
    return Scaffold(
      appBar: AppBar(
        title: const Text('الماسح الضوئي'),
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: MobileScanner(
              controller: _scannerController,
              fit: BoxFit.cover,
              onDetect: (capture) {
                final barcodes = capture.barcodes;
                if (barcodes.isEmpty) return;
                final first = barcodes.first;
                _handleBarcode(first.rawValue);
              },
            ),
          ),
          // Overlay frame + animated scan line
          IgnorePointer(
            child: Align(
              alignment: Alignment.center,
              child: Container(
                width: frameWidth,
                height: frameHeight,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  gradient: LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [
                    UiTokens.alpha(UiTokens.primary, 0.22),
                    UiTokens.alpha(UiTokens.accent, 0.22),
                    ],
                  ),
                ),
                child: Stack(
                  children: [
                    Center(
                      child: Container(
                        width: frameWidth,
                        height: frameHeight,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: UiTokens.alpha(Colors.white, 0.85), width: 1.6),
                        ),
                      ),
                    ),
                    _cornerBox(Alignment.topLeft),
                    _cornerBox(Alignment.topRight),
                    _cornerBox(Alignment.bottomLeft),
                    _cornerBox(Alignment.bottomRight),
                    AnimatedBuilder(
                      animation: _scanAnimation,
                      builder: (context, child) {
                        final t = _scanAnimation.value; // 0..1
                        final y = (frameHeight - 12) * t;
                        return Positioned(
                          left: 16,
                          right: 16,
                          top: y,
                          child: Container(
                            height: 12,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(999),
                              gradient: LinearGradient(
                                colors: [
                                  UiTokens.alpha(UiTokens.primary, 0.95),
                                  UiTokens.alpha(UiTokens.accent, 0.95),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: _withAlpha(Colors.black, 0.55),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    _isNavigating
                        ? 'جارٍ فتح المنتج…'
                        : 'وجّه الكاميرا نحو الباركود.\nعند اكتشافه سيتم الانتقال تلقائياً.',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          ),
          if (_isNavigating)
            Positioned.fill(
              child: IgnorePointer(
                child: Container(
                  color: _withAlpha(Colors.black, 0.12),
                  child: const Center(
                    child: SizedBox(
                      width: 36,
                      height: 36,
                      child: CircularProgressIndicator(strokeWidth: 3),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _cornerBox(Alignment alignment) {
    const double size = 26.0;
    const double stroke = 3.0;
    final angle = switch (alignment) {
      Alignment.topLeft => 0.0,
      Alignment.topRight => 90.0,
      Alignment.bottomRight => 180.0,
      Alignment.bottomLeft => 270.0,
      _ => 0.0,
    };
    return Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: SizedBox(
          width: size,
          height: size,
          child: Transform.rotate(
            angle: angle * 3.1415926535 / 180.0,
            child: CustomPaint(
              painter: _CornerPainter(stroke: stroke),
            ),
          ),
        ),
      ),
    );
  }
}

class _CornerPainter extends CustomPainter {
  final double stroke;
  _CornerPainter({required this.stroke});

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = UiTokens.alpha(Colors.white, 0.9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;

    final inset = stroke;
    final x0 = inset;
    final y0 = inset;
    canvas.drawLine(Offset(x0, y0), Offset(x0 + size.width * 0.45, y0), p);
    canvas.drawLine(Offset(x0, y0), Offset(x0, y0 + size.height * 0.45), p);
  }

  @override
  bool shouldRepaint(covariant _CornerPainter oldDelegate) => oldDelegate.stroke != stroke;
}

Color _withAlpha(Color color, double alpha) {
  final a = (alpha.clamp(0, 1) * 255).round();
  final v = color.toARGB32();
  final r = (v >> 16) & 0xFF;
  final g = (v >> 8) & 0xFF;
  final b = v & 0xFF;
  return Color.fromARGB(a, r, g, b);
}

