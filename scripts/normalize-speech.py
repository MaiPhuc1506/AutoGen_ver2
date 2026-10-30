"""Load only ZeroTTS's MIT stdlib text rules; no model, SDK startup or network."""
import importlib.util
import json
from pathlib import Path
import sys
path = Path(__file__).resolve().parent.parent / 'assets/third-party/zerotts-text-norm/vi_normalizer.py'
spec = importlib.util.spec_from_file_location('autogen_vi_normalizer', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
payload = json.load(sys.stdin)
if not isinstance(payload.get('text'), str) or len(payload['text']) > 100000:
    raise ValueError('Invalid normalization input')
print(json.dumps({'text': module.normalize_vi_text(payload['text'])}, ensure_ascii=False))
