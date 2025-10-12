package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

type Options struct {
	Path       string
	DisableWAL bool
}

func Open(opts Options) (*sql.DB, error) {
	if opts.Path == "" {
		opts.Path = "file:api.db?_pragma=busy_timeout(5000)"
	}
	db, err := sql.Open("sqlite", opts.Path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	pragma := func(sqlStmt string) error {
		_, e := db.ExecContext(ctx, sqlStmt)
		return e
	}
	if !opts.DisableWAL {
		_ = pragma(`PRAGMA journal_mode=WAL;`)
		_ = pragma(`PRAGMA synchronous=NORMAL;`)
	}
	_ = pragma(`PRAGMA foreign_keys=ON;`)
	_ = pragma(`PRAGMA busy_timeout=5000;`)

	return db, nil
}
