import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'package:mobile_app/presentation/screens/barcode_input_screen.dart';
import 'package:mobile_app/presentation/screens/scanner_screen.dart';
import 'package:mobile_app/config/ui_tokens.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  Widget _resolveHome() {
    if (kIsWeb) {
      final mode = Uri.base.queryParameters['mode']?.trim().toLowerCase();
      if (mode == 'scanner' || mode == 'scan' || mode == 'fast') {
        return const ScannerScreen();
      }
    }
    return const BarcodeInputScreen();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'سعر - تطبيق',
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: UiTokens.background,
        colorScheme: ColorScheme.fromSeed(seedColor: UiTokens.primary),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          elevation: 0,
          centerTitle: true,
        ),
        cardTheme: CardThemeData(
          color: UiTokens.surface,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: UiTokens.surface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(14)),
          ),
        ),
      ),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: _resolveHome(),
      ),
    );
  }
}

