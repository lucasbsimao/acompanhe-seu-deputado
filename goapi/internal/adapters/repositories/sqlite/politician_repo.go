package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/acompahe-seu-deputado/internal/domain"
	"github.com/acompahe-seu-deputado/internal/ports/repositories"
)

var _ repositories.PoliticianRepo = (*PoliticianRepo)(nil)

type PoliticianRepo struct {
	db *sql.DB
}

func NewPoliticianRepo(db *sql.DB) *PoliticianRepo {
	return &PoliticianRepo{db: db}
}

func (r *PoliticianRepo) GetByID(ctx context.Context, id string) (*domain.Politician, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, name, party FROM politicians WHERE id = ?`, id)
	var p domain.Politician
	if err := row.Scan(&p.ID, &p.Name, &p.Party); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *PoliticianRepo) List(ctx context.Context, limit, offset int) ([]domain.Politician, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, party FROM politicians ORDER BY id LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]domain.Politician, 0, limit)
	for rows.Next() {
		var p domain.Politician
		if err := rows.Scan(&p.ID, &p.Name, &p.Party); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PoliticianRepo) Create(ctx context.Context, p domain.Politician) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO politicians (id, name, party) VALUES (?, ?, ?)`,
		p.ID, p.Name, p.Party)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.ErrConflict
		}
		return err
	}
	return nil
}
