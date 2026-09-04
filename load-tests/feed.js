import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
};

const BASE = __ENV.API_URL || "http://localhost:8000";

export default function () {
  const guest = http.post(`${BASE}/v1/guest/sessions`);
  check(guest, { "guest 200": (r) => r.status === 200 });
  const token = guest.json("token");
  const feed = http.get(`${BASE}/v1/feed`, { headers: { Authorization: `Bearer ${token}` } });
  check(feed, { "feed 200": (r) => r.status === 200 });
  sleep(1);
}
