CREATE TABLE IF NOT EXISTS ufs (
  uf    CHAR(2) PRIMARY KEY,
  name  varchar(2) NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  acronym TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS politicians (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  uf    CHAR(2) NOT NULL REFERENCES ufs(uf),
  party_id TEXT REFERENCES parties(id)
);

CREATE TABLE IF NOT EXISTS users (
  id    TEXT PRIMARY KEY,
  uf    CHAR(2) NOT NULL REFERENCES ufs(uf)
);

CREATE TABLE IF NOT EXISTS users_politicians_followed (
  user_id    TEXT NOT NULL REFERENCES users(id),
  politician_id    TEXT NOT NULL REFERENCES politicians(id),
  PRIMARY KEY (user_id, politician_id)
)

CREATE TABLE IF NOT EXISTS users_parties_followed (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  description   TEXT,
  date          TIMESTAMP NOT NULL
);