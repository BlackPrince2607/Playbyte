import json
import ssl
import urllib.request
from pathlib import Path

path = Path(__file__).parent / "tmp" / "shapes_desk_1_left.jpg"
boundary = "----majaCld"
data = path.read_bytes()
CLOUD = "hzxyensd5"
PRESET = "docs_upload_example_us_preset"
body = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="upload_preset"\r\n\r\n'
    f"{PRESET}\r\n"
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="a.jpg"\r\n'
    f"Content-Type: image/jpeg\r\n\r\n"
).encode() + data + f"\r\n--{boundary}--\r\n".encode()
req = urllib.request.Request(
    f"https://api.cloudinary.com/v1_1/{CLOUD}/image/upload",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)
with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=120) as r:
    payload = json.loads(r.read().decode())
print(json.dumps({k: payload.get(k) for k in ["secure_url", "url", "public_id", "folder", "version"]}, indent=2))
url = payload["secure_url"]
req2 = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req2, context=ssl.create_default_context(), timeout=30) as r2:
    print("GET", r2.status, r2.headers.get("Content-Type"), len(r2.read()))
