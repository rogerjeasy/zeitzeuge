#!/usr/bin/env bash
# Create (or re-sync) the RLS-bound application role `zeitzeuge_app` in Aurora,
# with the password Terraform wrote to the zeitzeuge/prod/db/app secret.
#
# Runs over the RDS Data API as the RDS-managed master user: no bastion, no
# tunnel, no VPC access needed. Idempotent — run it again after a password
# rotation and it realigns the role. Run it once BEFORE the first migration:
# migration 0001 grants to zeitzeuge_app only if the role already exists.
#
# The password is never printed; it goes to a 0600 temp file that is removed
# on exit.
set -euo pipefail

REGION="${REGION:-eu-central-2}"
ENV="${ENV:-prod}"
cd "$(dirname "$0")/../envs/$ENV"

CLUSTER_ARN=$(terraform output -raw db_cluster_arn)
MASTER_SECRET=$(terraform output -raw db_master_secret_arn)
APP_SECRET=$(terraform output -raw db_app_secret_arn)
DB_NAME=$(terraform output -raw db_name)

PASSWORD=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$APP_SECRET" \
  --query SecretString --output text | python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])')

# Terraform generates it alphanumeric-only; refuse anything else rather than
# risk breaking out of the SQL literal.
[[ "$PASSWORD" =~ ^[A-Za-z0-9]{32,}$ ]] || { echo "unexpected password format in $APP_SECRET" >&2; exit 1; }

umask 077
SQL_FILE=$(mktemp)
trap 'rm -f "$SQL_FILE"' EXIT
cat > "$SQL_FILE" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zeitzeuge_app') THEN
    CREATE ROLE zeitzeuge_app LOGIN PASSWORD '${PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE zeitzeuge_app WITH LOGIN PASSWORD '${PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO zeitzeuge_app', current_database());
  GRANT USAGE, CREATE ON SCHEMA public TO zeitzeuge_app;
END
\$\$;
SQL

run() {
  aws rds-data execute-statement --region "$REGION" \
    --resource-arn "$CLUSTER_ARN" --secret-arn "$MASTER_SECRET" --database "$DB_NAME" "$@"
}

# The first call may wake a paused cluster (~15 s); the Data API retries are
# not enough on their own, so give it a few attempts.
for attempt in 1 2 3 4 5; do
  if run --sql "file://$SQL_FILE" >/dev/null 2>&1; then break; fi
  [ "$attempt" = 5 ] && { echo "Data API call failed after 5 attempts" >&2; run --sql "file://$SQL_FILE"; }
  echo "  cluster resuming… retry $attempt"; sleep 15
done

run --sql "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'zeitzeuge_app'" \
  --query 'records[0]' --output text \
  | awk '{print "zeitzeuge_app: superuser=" $2 ", bypassrls=" $3 " (both must be False)"}'
