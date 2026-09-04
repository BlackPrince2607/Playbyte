# Backups and recovery

PostgreSQL is the system of record.

## Hosted (Supabase)

- Enable PITR / daily backups on the production project.
- Retention: at least 7 days for MVP; 30 days once live traffic exists.
- Test restore into a throwaway project quarterly.

## Self-hosted / Docker

```bash
pg_dump -Fc postgresql://playbyte:playbyte@localhost:5432/playbyte > backup.dump
```

Restore:

```bash
pg_restore --clean --if-exists -d postgresql://playbyte:playbyte@localhost:5432/playbyte backup.dump
```

## What to restore

Users, moments, responses, game_plays, friendships, consents, data_requests. Object storage (avatars, share cards) is restored separately from the bucket.
