"""Local ZeroTTS bridge. Does not accept model paths, code, voice ZIPs or remote URLs."""
import argparse
import hmac
import io
import json
import os
from pathlib import Path
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent.parent
REVISION = 'c2bfbd67dc648cac455077333f7cf5c18a2e3bb4'
VOICES = ['maichi', 'baotrang', 'kimoanh', 'hamy', 'giahuy', 'huuduc', 'quangminh', 'tiendat']
os.environ.setdefault('HF_HOME', str(ROOT / '.zerotts-models'))
os.environ.setdefault('ZEROTTS_VOICES_HOME', str(ROOT / '.zerotts-runtime' / 'voices'))


def load_model():
    from zerotts import ZeroTTS, hub
    import shutil
    local = ROOT / '.zerotts-models' / ('model-' + REVISION)
    if not local.exists():
        snapshot = hub.resolve_model_dir('zeroweight-ai/ZeroTTS', revision=REVISION,
                                         cache_dir=str(ROOT / '.zerotts-models'))
        # ONNX external weights must be real neighbouring files, not Hub blob symlinks.
        staging = local.with_name(local.name + '.preparing-' + str(os.getpid()))
        shutil.copytree(snapshot, staging, symlinks=False)
        staging.rename(local)
    return ZeroTTS.from_pretrained(str(local), intra_op_num_threads=4)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--port', type=int, default=7821)
    args = parser.parse_args()
    runtime = ROOT / '.zerotts-runtime'
    runtime.mkdir(exist_ok=True)
    model = load_model()
    available = model.list_voices()
    missing = set(VOICES) - set(available)
    if missing:
        raise RuntimeError('Missing bundled voices: ' + ', '.join(sorted(missing)))
    (runtime / 'installed.json').write_text(json.dumps({'package': '0.1.5', 'revision': REVISION, 'voices': VOICES}))
    if args.prepare:
        print('ZeroTTS ready: 8 bundled voices, pinned revision ' + REVISION, flush=True)
        return
    token = os.environ.get('LC_ZEROTTS_TOKEN', '')
    if len(token) < 32:
        raise RuntimeError('Missing local worker token')
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log narration or authorization headers.

        def send_json(self, status, data):
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != '/health':
                return self.send_json(404, {'error': 'Not found'})
            self.send_json(200, {'service': 'lc-autogen-zerotts', 'ready': True, 'revision': REVISION, 'voices': VOICES})

        def do_POST(self):
            if self.path != '/synthesize':
                return self.send_json(404, {'error': 'Not found'})
            if self.headers.get('Origin') or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
                return self.send_json(403, {'error': 'Unauthorized local request'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length <= 0 or length > 65536:
                    raise ValueError('Invalid request size')
                data = json.loads(self.rfile.read(length))
                text, voice = data.get('text'), data.get('voice')
                if not isinstance(text, str) or not text.strip() or len(text) > 8000 or voice not in VOICES:
                    raise ValueError('Invalid text or voice')
                import numpy as np
                import soundfile as sf
                from zerotts.chunking import chunk_text, normalize_punctuation, clean_segment_punctuation
                from zerotts.audio import concat_with_silence
                segments = [clean_segment_punctuation(s) for s in chunk_text(normalize_punctuation(text), max_chunk_sec=12)]
                with lock:
                    # Seed makes repeated synthesis reproducible for this pinned runtime.
                    np.random.seed(36)
                    audio = concat_with_silence([model.synthesize(s, voice=voice) for s in segments], 0.05, model.sample_rate)
                if audio.size == 0 or not np.isfinite(audio).all():
                    raise RuntimeError('Empty or invalid audio')
                stream = io.BytesIO()
                sf.write(stream, audio.reshape(-1), model.sample_rate, format='WAV', subtype='PCM_16')
                body = stream.getvalue()
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (ValueError, TypeError, json.JSONDecodeError):
                self.send_json(400, {'error': 'Invalid synthesis request'})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.send_json(500, {'error': 'ZeroTTS synthesis failed; check model installation'})

    print('ZeroTTS worker listening on loopback:' + str(args.port), flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
