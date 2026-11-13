-- Distinguishes newly priced switches from original 24-hour promises.
CREATE TABLE calling_policy_epochs(id text PRIMARY KEY,installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO calling_policy_epochs(id) VALUES('calling-change-2');
