from pathlib import Path

from app.config import get_settings


def main() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    print(f".env exists: {env_path.exists()}")
    if env_path.exists():
        keys_present = []
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                keys_present.append((k.strip(), len(v.strip()), v.strip()[:3] + "..." if len(v.strip()) > 3 else "(empty)"))
        for k, length, preview in keys_present:
            if k.startswith(("SUPABASE", "DATABASE", "GUEST", "ADMIN", "APP")):
                status = "set" if length > 0 else "EMPTY"
                print(f"  {k}: {status} (len={length})")

    settings = get_settings()
    checks = {
        "database_is_supabase": "supabase" in settings.database_url.lower() or "pooler" in settings.database_url.lower(),
        "supabase_url": settings.supabase_url.startswith("https://"),
        "supabase_anon": len(settings.supabase_anon_key) > 20,
        "supabase_service": len(settings.supabase_service_role_key) > 20,
        "supabase_jwt": len(settings.supabase_jwt_secret) > 10,
        "guest_secret_strong": len(settings.guest_token_secret) >= 32
        and settings.guest_token_secret != "change-me-guest-token-secret",
        "admin_key_strong": len(settings.admin_api_key) >= 32 and settings.admin_api_key != "dev-admin-key",
    }
    print("Settings loaded from backend:")
    for name, ok in checks.items():
        print(f"  {name}: {'OK' if ok else 'MISSING'}")


if __name__ == "__main__":
    main()
