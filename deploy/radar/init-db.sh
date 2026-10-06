#!/bin/sh
set -eu
# Only runs on a new Compose database volume; the AI database is created by the image entrypoint.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE DATABASE radar_medical;
SQL
