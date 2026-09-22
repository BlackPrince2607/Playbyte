import json
import urllib.request
from pathlib import Path

build_json = Path(r"D:\Play\tmp-build.json")
# Load from previous eas output if present; otherwise expect stdin path
# Re-fetch via httpx if we have stored URL
# Prefer reading stored log URL from a small helper file

from subprocess import run

r = run(
    ["pnpm", "exec", "eas", "build:view", "9baaff97-e64a-490d-a620-389ff527a206", "--json"],
    cwd=r"D:\Play\apps\mobile",
    capture_output=True,
    shell=True,
)
s = (r.stdout or b"").decode("utf-8-sig", errors="replace")
i = s.find("{")
if i < 0:
    print("NO_JSON", r.returncode, s[:500], (r.stderr or b"").decode()[:500])
    raise SystemExit(1)
d = json.loads(s[i:])
url = d["logFiles"][0]
print("Downloading logs...")
txt = urllib.request.urlopen(url, timeout=90).read().decode("utf-8", errors="replace")
Path(r"D:\Play\tmp-eas-log.txt").write_text(txt, encoding="utf-8")
keys = ("FAILURE", "What went wrong", "FAILED", "iosUrlScheme", "google-signin", "Execution failed", "error: ", "Error: ")
lines = txt.splitlines()
print("lines", len(lines))
for n, l in enumerate(lines):
    if any(k in l for k in keys):
        print(f"{n}: {l[:240]}")
