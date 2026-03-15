package services

import (
	"context"

	"github.com/acompahe-seu-deputado/internal/domain"
)

type UserService interface {
	Get(ctx context.Context, id string) (*domain.User, error)
	List(ctx context.Context, limit, offset int) ([]domain.User, error)
	Create(ctx context.Context, p domain.User) (*domain.User, error)
}
