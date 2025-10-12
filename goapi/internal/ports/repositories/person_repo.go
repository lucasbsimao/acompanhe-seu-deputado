package repositories

import (
	"context"

	"github.com/acompahe-seu-deputado/internal/domain"
)

type PersonRepo interface {
	GetByID(ctx context.Context, id string) (*domain.Person, error)
	List(ctx context.Context, limit, offset int) ([]domain.Person, error)
	Create(ctx context.Context, p domain.Person) error
}
