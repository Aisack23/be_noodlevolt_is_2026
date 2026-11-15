BEGIN;
CREATE TABLE api_rate_limits (
    key VARCHAR(160) NOT NULL,
    hits INTEGER NOT NULL,
    expires_at TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT api_rate_limits_pkey PRIMARY KEY (key),
    CONSTRAINT api_rate_limits_hits_nonnegative CHECK (hits >= 0)
);
CREATE INDEX api_rate_limits_expires_at_idx ON api_rate_limits(expires_at);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);
COMMIT;
