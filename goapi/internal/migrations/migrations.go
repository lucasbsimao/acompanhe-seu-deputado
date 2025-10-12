package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"sort"
	"strings"
)

//go:embed sql/*.sql
var sqlFS embed.FS

func Apply(ctx context.Context, db *sql.DB) error {
	if err := ensureTable(ctx, db); err != nil {
		return fmt.Errorf("ensure schema_migrations: %w", err)
	}

	applied, err := getAppliedVersions(ctx, db)
	if err != nil {
		return err
	}

	entries, err := sqlFS.ReadDir("sql")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".sql") {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		version := strings.TrimSuffix(name, ".sql")
		if applied[version] {
			continue
		}
		b, err := sqlFS.ReadFile("sql/" + name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if err := applyOne(ctx, db, version, string(b)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}

	return nil
}

func ensureTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`)
	return err
}

func getAppliedVersions(ctx context.Context, db *sql.DB) (map[string]bool, error) {
	rows, err := db.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	set := map[string]bool{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		set[v] = true
	}
	return set, rows.Err()
}

func applyOne(ctx context.Context, db *sql.DB, version, script string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, script); err != nil {
		_ = tx.Rollback()
		return err
	}

	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES (?)`, version); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}
