package repositories

import (
	"context"

	"github.com/acompahe-seu-deputado/internal/domain"
)

type PersonRepo interface {
	GetByID(ctx context.Context, id string) (*domain.User, error)
	List(ctx context.Context, limit, offset int) ([]domain.User, error)
	Create(ctx context.Context, p domain.User) error
}
