import 'package:flutter/material.dart';

class UiTokens {
  static const Color primary = Color(0xFF3B82F6); // blue
  static const Color accent = Color(0xFF06B6D4); // cyan
  static const Color success = Color(0xFF22C55E); // green
  static const Color danger = Color(0xFFE11D48); // rose
  static const Color background = Color(0xFFF6F7FB);
  static const Color surface = Colors.white;
  static const Color textPrimary = Color(0xFF0F172A); // slate-900
  static const Color textSecondary = Color(0xFF64748B); // slate-500

  static LinearGradient headerGradient() {
    return const LinearGradient(
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
      colors: [
        Color(0xFF2563EB), // blue-600
        Color(0xFF06B6D4), // cyan-500
      ],
    );
  }

  static Color alpha(Color color, double opacity) {
    final a = (opacity.clamp(0, 1) * 255).round();
    final v = color.toARGB32();
    final r = (v >> 16) & 0xFF;
    final g = (v >> 8) & 0xFF;
    final b = v & 0xFF;
    return Color.fromARGB(a, r, g, b);
  }

  static BoxDecoration glassCard() {
    return BoxDecoration(
      color: alpha(Colors.white, 0.75),
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: alpha(Colors.white, 0.55)),
      boxShadow: const [
        BoxShadow(
          blurRadius: 14,
          offset: Offset(0, 10),
          color: Color(0x15000000),
        ),
      ],
    );
  }
}

