-- The atomic rate-limit upsert requires one unique key_hash index.
DO $$
BEGIN
  IF to_regclass('public.auth_rate_limits') IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'DATABASE_MIGRATION_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
    WHERE t.oid = to_regclass('public.auth_rate_limits')
      AND i.indisunique
      AND i.indisvalid
      AND i.indnkeyatts = 1
      AND a.attname = 'key_hash'
  ) THEN
    CREATE UNIQUE INDEX auth_rate_limits_key_hash_uidx ON auth_rate_limits(key_hash);
  END IF;
END
$$;
