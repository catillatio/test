#!/bin/sh
# Runs INSIDE the existing PostgreSQL service over authenticated SSH. No URL,
# password or database dump is written to logs. No source database writes.
set -eu
operation=$1
release_id=$2
case "$release_id" in *[!a-z0-9_]*|'') exit 20;; esac
[ "${#release_id}" -le 40 ] || exit 20
export PGHOST=127.0.0.1 PGPORT=5432
: "${PGDATABASE:?}" "${PGUSER:?}" "${PGPASSWORD:?}"
case "$PGDATABASE" in *[!a-zA-Z0-9_-]*|'') exit 20;; esac
private_host=${RAILWAY_PRIVATE_DOMAIN:-}
case "$private_host" in *[!a-z0-9.-]*) exit 20;; esac
backup="/tmp/kc_${release_id}.dump"
copy="kc_${release_id}_restore_test"
case "$operation" in
 backup)
  [ ! -e "$backup" ] || exit 21
  umask 077
  # All identity/count checks are read-only. Refuse an uninitialized/empty realm.
  counts=$(psql -X -v ON_ERROR_STOP=1 -Atc "SELECT (SELECT count(*) FROM accounts)||','||(SELECT count(*) FROM development_bots)||','||(SELECT count(*) FROM schema_migrations WHERE name='019_champions_and_rivalries.sql')")
  bots=$(printf '%s' "$counts" | cut -d, -f2)
  installed=$(printf '%s' "$counts" | cut -d, -f3)
  [ "$bots" = 450 ] && [ "$installed" = 1 ] || exit 22
  source_bytes=$(psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT pg_database_size(current_database())')
  data_free_kb=$(df -Pk "${PGDATA:?}" | awk 'NR==2 {print $4}')
  temporary_free_kb=$(df -Pk /tmp | awk 'NR==2 {print $4}')
  [ "$((data_free_kb * 1024))" -gt "$((source_bytes * 2 + 134217728))" ] || exit 28
  [ "$((temporary_free_kb * 1024))" -gt "$((source_bytes + 134217728))" ] || exit 28
  pg_dump --format=custom --no-owner --no-acl --file="$backup"
  pg_restore --list "$backup" >/dev/null
  digest=$(sha256sum "$backup" | cut -d' ' -f1)
  bytes=$(wc -c < "$backup" | tr -d ' ')
  [ "$bytes" -gt 100000 ] || exit 23
  printf '{"sha256":"%s","bytes":%s,"accounts":%s,"bots":450,"copy":"%s","sourceDatabase":"%s","privateHost":"%s"}\n' "$digest" "$bytes" "$(printf '%s' "$counts" | cut -d, -f1)" "$copy" "$PGDATABASE" "$private_host"
  ;;
 export) [ -s "$backup" ] || exit 24; cat "$backup";;
 restore)
  [ -s "$backup" ] || exit 24
  [ "$copy" != "$PGDATABASE" ] || exit 25
  # Never --clean, dropdb, reset, migrate or seed the original database.
  [ "$(psql -X -At -v ON_ERROR_STOP=1 -v copy="$copy" -c "SELECT count(*) FROM pg_database WHERE datname='$copy'")" = 0 ] || exit 26
  createdb -- "$copy"
  pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$copy" "$backup"
  printf '{"restored":true,"database":"%s"}\n' "$copy"
  ;;
 *) exit 27;;
esac
