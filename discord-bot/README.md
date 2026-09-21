# Lost Talent Discord bot

This worker is the first production scaffold for database-driven Discord transactions.

## Core rule

The database is the source of truth. Discord roles are a synchronized side effect.

1. Staff approves a roster/verification transaction.
2. The database transaction commits.
3. One or more `discord_sync_jobs` are queued.
4. The bot resolves the player's stored immutable Discord user ID.
5. The bot adds/removes the configured role.
6. Success/failure is written back to the sync job.

A Discord outage therefore does not lose or roll back the roster transaction.

## Environment

Use the root `.env.example` as the reference. The Supabase secret key and Discord token are server-only secrets.

## Next bot modules

- Slash-command registration
- Veto sessions (BO3 / BO5 / BO7; HP / SnD / Standard)
- Community 8s + League 8s queues
- Match scheduling reminders
- Match report notifications
- Staff review notifications
- Full desired-state role reconciliation
