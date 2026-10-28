#!/usr/bin/env python3
"""Download one pinned upstream engine and verify it before packaging."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

root = Path(__file__).resolve().parents[1]
pins = json.loads((root / 'android/upstream.json').read_text())['torrserver']
abi, destination = sys.argv[1:]
asset = pins['assets'][abi]
url = f"https://github.com/{pins['repository']}/releases/download/{pins['tag']}/{asset['name']}"
request = urllib.request.Request(url, headers={'User-Agent':'CinemaHall-build'})
with urllib.request.urlopen(request, timeout=120) as response:
    data = response.read()
if hashlib.sha256(data).hexdigest() != asset['sha256']:
    raise SystemExit('TorrServer SHA-256 mismatch; refusing to package')
path = Path(destination)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_bytes(data)
print(f'Verified {asset["name"]}')
