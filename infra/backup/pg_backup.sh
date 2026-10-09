#!/usr/bin/env bash
# Nightly Postgres dump for the VPS. Runs from root's crontab:
#   30 3 * * * /opt/shipcheck/infra/backup/pg_backup.sh >> /var/log/shipcheck-backup.log 2>&1
# Credentials are read inside the postgres container from its own env, so this script holds no secrets.
# Restore: docker compose -f infra/docker-compose.yml exec -T postgres \
#   sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < <file>.dump
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/shipcheck}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/shipcheck-$stamp.dump"

# Write to a temp name first so a failed dump never looks like a good backup.
docker compose -f "$REPO_DIR/infra/docker-compose.yml" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$target.partial"
mv "$target.partial" "$target"
chmod 600 "$target"

find "$BACKUP_DIR" -name 'shipcheck-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'shipcheck-*.dump.partial' -mtime +1 -delete

echo "$(date -u +%FT%TZ) backup ok: $target ($(du -h "$target" | cut -f1))"
