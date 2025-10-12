package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/acompahe-seu-deputado/internal/domain"
	"github.com/acompahe-seu-deputado/internal/ports/repositories"
)

var _ repositories.PersonRepo = (*PersonRepo)(nil)

type PersonRepo struct {
	db *sql.DB
}

func NewPersonRepo(db *sql.DB) *PersonRepo {
	return &PersonRepo{db: db}
}

func (r *PersonRepo) GetByID(ctx context.Context, id string) (*domain.Person, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, name, party FROM persons WHERE id = ?`, id)
	var p domain.Person
	if err := row.Scan(&p.ID, &p.Name, &p.Party); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *PersonRepo) List(ctx context.Context, limit, offset int) ([]domain.Person, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, party FROM persons ORDER BY id LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]domain.Person, 0, limit)
	for rows.Next() {
		var p domain.Person
		if err := rows.Scan(&p.ID, &p.Name, &p.Party); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PersonRepo) Create(ctx context.Context, p domain.Person) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO persons (id, name, party) VALUES (?, ?, ?)`,
		p.ID, p.Name, p.Party)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.ErrConflict
		}
		return err
	}
	return nil
}
