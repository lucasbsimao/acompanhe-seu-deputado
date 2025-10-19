package services

import (
	"context"

	"github.com/acompahe-seu-deputado/internal/domain"
)

type PersonService interface {
	Get(ctx context.Context, id string) (*domain.Person, error)
	List(ctx context.Context, limit, offset int) ([]domain.Person, error)
	Create(ctx context.Context, p domain.Person) (*domain.Person, error)
}
