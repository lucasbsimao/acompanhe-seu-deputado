package repositories

import (
	"context"

	"github.com/acompahe-seu-deputado/internal/domain"
)

type PoliticianRepo interface {
	GetByID(ctx context.Context, id string) (*domain.Politician, error)
	List(ctx context.Context, limit, offset int) ([]domain.Politician, error)
	Create(ctx context.Context, p domain.Politician) error
}
