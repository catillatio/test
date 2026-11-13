CREATE INDEX characters_rival_level_id ON characters(attained_level,id);
CREATE TABLE rival_recommendation_snapshots(id uuid PRIMARY KEY,sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,actor_id uuid NOT NULL REFERENCES characters(id),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,policy_id text NOT NULL,actor_level integer NOT NULL CHECK(actor_level>0));
CREATE INDEX rival_snapshot_owner ON rival_recommendation_snapshots(actor_id,created_at DESC);
CREATE TABLE rival_recommendation_entries(snapshot_id uuid NOT NULL REFERENCES rival_recommendation_snapshots(id) ON DELETE CASCADE,ordinal integer NOT NULL CHECK(ordinal>0),target_id uuid NOT NULL,PRIMARY KEY(snapshot_id,ordinal),UNIQUE(snapshot_id,target_id));
