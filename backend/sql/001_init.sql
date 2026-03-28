-- ─────────────────────────────────────────────
-- PisteUp — Schema
-- Paste this entire file into Supabase SQL Editor and click Run
-- PostGIS and uuid-ossp must be enabled first (see README)
-- ─────────────────────────────────────────────

CREATE TYPE IF NOT EXISTS report_type   AS ENUM ('road','border','camp','fuel','mechanic','hazard');
CREATE TYPE IF NOT EXISTS report_status AS ENUM ('good','warning','bad','closed','unknown');

-- Users
CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  username         VARCHAR(40) NOT NULL UNIQUE,
  email            TEXT        NOT NULL UNIQUE,
  password_hash    TEXT        NOT NULL,
  display_name     VARCHAR(80) NOT NULL,
  bio              TEXT,
  avatar_url       TEXT,
  vehicle          VARCHAR(80),
  home_country     CHAR(2),
  km_logged        FLOAT       NOT NULL DEFAULT 0,
  countries_visited INT        NOT NULL DEFAULT 0,
  trust_score      FLOAT       NOT NULL DEFAULT 2.5,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  last_seen_at     TIMESTAMPTZ,
  location_lat     FLOAT,
  location_lng     FLOAT,
  location         GEOGRAPHY(Point,4326),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST(location);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          report_type   NOT NULL,
  status        report_status NOT NULL DEFAULT 'unknown',
  title         VARCHAR(120)  NOT NULL,
  description   TEXT          NOT NULL,
  lat           FLOAT         NOT NULL,
  lng           FLOAT         NOT NULL,
  location      GEOGRAPHY(Point,4326),
  location_name VARCHAR(120),
  country_code  CHAR(2),
  author_id     UUID          NOT NULL REFERENCES users(id),
  upvotes       INT           NOT NULL DEFAULT 0,
  downvotes     INT           NOT NULL DEFAULT 0,
  tags          TEXT[]        NOT NULL DEFAULT '{}',
  vehicle_types TEXT[]        NOT NULL DEFAULT '{}',
  photos        TEXT[]        NOT NULL DEFAULT '{}',
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_location ON reports USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_reports_type     ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_created  ON reports(created_at DESC);

-- Report sub-tables
CREATE TABLE IF NOT EXISTS road_conditions (
  id            TEXT  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_id     UUID  NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  surface_score INT   NOT NULL,
  safety_score  INT   NOT NULL,
  surface_type  VARCHAR(20) NOT NULL,
  passable_by   TEXT[] NOT NULL DEFAULT '{}',
  distance_km   FLOAT
);

CREATE TABLE IF NOT EXISTS border_data (
  id                  TEXT  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_id           UUID  NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  wait_time_minutes   INT,
  cost                FLOAT,
  currency            VARCHAR(3),
  documents_required  TEXT[] NOT NULL DEFAULT '{}',
  visa_on_arrival     BOOLEAN,
  carnet_required     BOOLEAN,
  notes               TEXT
);

CREATE TABLE IF NOT EXISTS camp_data (
  id              TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_id       UUID    NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  is_free         BOOLEAN NOT NULL DEFAULT true,
  price_per_night FLOAT,
  currency        VARCHAR(3),
  has_water       BOOLEAN NOT NULL DEFAULT false,
  has_facilities  BOOLEAN NOT NULL DEFAULT false,
  is_wild         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS fuel_data (
  id            TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_id     UUID    NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  diesel        FLOAT,
  petrol        FLOAT,
  currency      VARCHAR(3),
  available     BOOLEAN NOT NULL DEFAULT true,
  queue_minutes INT
);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id     UUID        NOT NULL REFERENCES users(id),
  content       TEXT        NOT NULL,
  photos        TEXT[]      NOT NULL DEFAULT '{}',
  lat           FLOAT,
  lng           FLOAT,
  location      GEOGRAPHY(Point,4326),
  location_name VARCHAR(120),
  country_code  CHAR(2),
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  upvotes       INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES users(id),
  content    TEXT        NOT NULL,
  upvotes    INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- Votes
CREATE TABLE IF NOT EXISTS votes (
  id        UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id UUID    REFERENCES reports(id) ON DELETE CASCADE,
  post_id   UUID    REFERENCES posts(id)   ON DELETE CASCADE,
  value     INT     NOT NULL CHECK (value IN (1,-1)),
  CONSTRAINT vote_report_unique UNIQUE (user_id, report_id),
  CONSTRAINT vote_post_unique   UNIQUE (user_id, post_id),
  CONSTRAINT vote_one_target CHECK (
    (report_id IS NOT NULL AND post_id IS NULL) OR
    (post_id   IS NOT NULL AND report_id IS NULL)
  )
);

-- Trips
CREATE TABLE IF NOT EXISTS trips (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id),
  title           VARCHAR(120) NOT NULL,
  description     TEXT,
  start_date      TIMESTAMPTZ NOT NULL,
  end_date        TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT false,
  distance_km     FLOAT       NOT NULL DEFAULT 0,
  country_codes   TEXT[]      NOT NULL DEFAULT '{}',
  cover_photo_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);

CREATE TABLE IF NOT EXISTS trip_waypoints (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat           FLOAT       NOT NULL,
  lng           FLOAT       NOT NULL,
  location_name VARCHAR(120),
  arrived_at    TIMESTAMPTZ NOT NULL,
  photos        TEXT[]      NOT NULL DEFAULT '{}',
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_waypoints_trip ON trip_waypoints(trip_id);

-- Auto-sync geography from lat/lng
CREATE OR REPLACE FUNCTION sync_location() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::GEOGRAPHY;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_reports_location
  BEFORE INSERT OR UPDATE OF lat, lng ON reports
  FOR EACH ROW EXECUTE FUNCTION sync_location();

CREATE OR REPLACE TRIGGER trg_users_location
  BEFORE INSERT OR UPDATE OF location_lat, location_lng ON users
  FOR EACH ROW EXECUTE FUNCTION sync_location();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER trg_reports_updated BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER trg_posts_updated   BEFORE UPDATE ON posts   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER trg_trips_updated   BEFORE UPDATE ON trips   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
