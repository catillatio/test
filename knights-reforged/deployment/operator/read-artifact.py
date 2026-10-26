"""Bounded, non-extracting reader for our own authenticated review artifact.
Never prints archive contents, exceptions, paths, URLs or credentials.
"""
import json
import sys
import zipfile
try:
    with zipfile.ZipFile(sys.argv[1]) as archive:
        entries = archive.infolist()
        assert sorted(e.filename for e in entries) == ['review.age', 'review.json']
        assert all(e.file_size <= 32000 and e.compress_size <= 64000 and not e.flag_bits & 1 for e in entries)
        report = archive.read('review.json')
        encrypted = archive.read('review.age')
        import base64
        assert base64.b64decode(json.loads(report)['encrypted'], validate=True) == encrypted
        sys.stdout.buffer.write(report)
except Exception:
    sys.exit(1)
