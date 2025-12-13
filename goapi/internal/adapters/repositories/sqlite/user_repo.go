package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/acompahe-seu-deputado/internal/domain"
	"github.com/acompahe-seu-deputado/internal/ports/repositories"
)

var _ repositories.UserRepo = (*UserRepo)(nil)

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*domain.User, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id FROM persons WHERE id = ?`, id)
	var p domain.User
	if err := row.Scan(&p.ID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *UserRepo) List(ctx context.Context, limit, offset int) ([]domain.User, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, party FROM persons ORDER BY id LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]domain.User, 0, limit)
	for rows.Next() {
		var p domain.User
		if err := rows.Scan(&p.ID); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *UserRepo) Create(ctx context.Context, p domain.User) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO persons (id) VALUES (?)`,
		p.ID)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.ErrConflict
		}
		return err
	}
	return nil
}
