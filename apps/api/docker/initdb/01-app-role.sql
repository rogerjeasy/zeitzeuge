-- The role the application connects as.
--
-- It mirrors what Terraform creates in Aurora, and the important property is
-- what it is *not*: not a superuser, and not `BYPASSRLS`. Both of those ignore
-- every row-level-security policy in the schema, so a suite that connected as
-- one would pass while production leaked. `tests/test_rls.py` refuses to run
-- as a superuser for exactly that reason.
--
-- Idempotent, and database-agnostic: it is run by docker-entrypoint-initdb.d
-- locally and by `psql -f` in CI, against differently named databases.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zeitzeuge_app') THEN
        CREATE ROLE zeitzeuge_app
            LOGIN PASSWORD 'zeitzeuge_app'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;

    EXECUTE format('GRANT CONNECT ON DATABASE %I TO zeitzeuge_app', current_database());
END
$$;

GRANT USAGE, CREATE ON SCHEMA public TO zeitzeuge_app;
