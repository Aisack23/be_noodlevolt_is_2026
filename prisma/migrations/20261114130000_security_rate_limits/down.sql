BEGIN;
DROP INDEX refresh_tokens_expires_at_idx;
DROP TABLE api_rate_limits;
COMMIT;
