CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  admin_key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  drawn_at TEXT
);

CREATE TABLE families (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_families_event ON families(event_id);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  wishlist TEXT NOT NULL DEFAULT '',
  wishlist_updated_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_participants_event ON participants(event_id);

CREATE TABLE assignments (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  giver_id TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE
);

CREATE TABLE images (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  url TEXT,
  mime TEXT,
  data BLOB,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_images_participant ON images(participant_id);
