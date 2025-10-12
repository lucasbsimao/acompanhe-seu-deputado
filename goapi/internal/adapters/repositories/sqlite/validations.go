package sqlite

import (
	"errors"

	sqlite "modernc.org/sqlite"

	sqlite3 "modernc.org/sqlite/lib"
)

func isUniqueViolation(err error) bool {
	var se *sqlite.Error
	if !errors.As(err, &se) {
		return false
	}
	switch se.Code() {
	case sqlite3.SQLITE_CONSTRAINT_UNIQUE,
		sqlite3.SQLITE_CONSTRAINT_PRIMARYKEY,
		sqlite3.SQLITE_CONSTRAINT_ROWID:
		return true
	default:
		return false
	}
}
