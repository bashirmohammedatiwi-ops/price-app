import 'package:flutter/material.dart';
import 'package:mobile_app/config/backend_url_provider.dart';

class BackendUrlDialog extends StatefulWidget {
  final BackendUrlProvider provider;

  const BackendUrlDialog({
    super.key,
    required this.provider,
  });

  @override
  State<BackendUrlDialog> createState() => _BackendUrlDialogState();
}

class _BackendUrlDialogState extends State<BackendUrlDialog> {
  late final TextEditingController _controller;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _init();
  }

  Future<void> _init() async {
    final base = await widget.provider.getBaseUrl();
    if (!mounted) return;
    _controller.text = base;
    setState(() {
      _loading = false;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _error = null);
    final value = _controller.text.trim();
    if (value.isEmpty) {
      setState(() => _error = 'الرابط لا يمكن أن يكون فارغاً.');
      return;
    }
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      setState(() => _error = 'الرابط يجب أن يبدأ بـ http:// أو https://');
      return;
    }

    await widget.provider.setBaseUrl(value);
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('إعداد رابط السيرفر'),
      content: _loading
          ? const SizedBox(
              height: 60,
              child: Center(child: CircularProgressIndicator()),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: _controller,
                  decoration: const InputDecoration(
                    labelText: 'Backend URL',
                    hintText: 'مثال: http://10.0.2.2:3001',
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w600),
                    ),
                  ),
              ],
            ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('إلغاء'),
        ),
        ElevatedButton(
          onPressed: _loading ? null : _save,
          child: const Text('حفظ'),
        ),
      ],
    );
  }
}

