import json
import ssl
import urllib.request
from pathlib import Path

p = Path(__file__).parent / "tmp" / "shapes_desk_1_left.jpg"
data = p.read_bytes()
boundary = "----bound"
body = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="a.jpg"\r\n'
    f"Content-Type: image/jpeg\r\n\r\n"
).encode() + data + f"\r\n--{boundary}--\r\n".encode()
req = urllib.request.Request(
    "https://tmpfiles.org/api/v1/upload",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "curl/8.0"},
    method="POST",
)
with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=60) as r:
    print(r.read().decode()[:500])
