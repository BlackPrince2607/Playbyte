from typing import Protocol


class RealtimePublisher(Protocol):
    async def publish_crowd_snapshot(self, moment_id: str, payload: dict) -> None: ...


class NoopRealtimePublisher:
    async def publish_crowd_snapshot(self, moment_id: str, payload: dict) -> None:
        return None


class SupabaseBroadcastPublisher:
    def __init__(self, url: str, service_key: str) -> None:
        self._url = url.rstrip("/")
        self._key = service_key

    async def publish_crowd_snapshot(self, moment_id: str, payload: dict) -> None:
        if not self._url or not self._key:
            return
        import httpx

        # Broadcast HTTP API varies by project; failures must never block writes.
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                await client.post(
                    f"{self._url}/realtime/v1/api/broadcast",
                    headers={
                        "apikey": self._key,
                        "Authorization": f"Bearer {self._key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "messages": [
                            {
                                "topic": f"moment:{moment_id}",
                                "event": "crowd.snapshot",
                                "payload": payload,
                            }
                        ]
                    },
                )
        except Exception:
            return
