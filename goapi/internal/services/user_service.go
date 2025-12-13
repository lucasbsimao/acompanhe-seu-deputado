package services

import (
	"context"
	"errors"

	"github.com/acompahe-seu-deputado/internal/domain"
	"github.com/acompahe-seu-deputado/internal/ports/repositories"
	"github.com/acompahe-seu-deputado/internal/ports/services"
)

type PersonService struct {
	repo repositories.PersonRepo
}

var _ services.UserService = (*PersonService)(nil)

func NewPersonService(repo repositories.PersonRepo) *PersonService {
	return &PersonService{repo: repo}
}

func (s *PersonService) Get(ctx context.Context, id string) (*domain.User, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *PersonService) List(ctx context.Context, limit, offset int) ([]domain.User, error) {
	if limit <= 0 || limit > 1000 {
		return nil, domain.ErrValidation
	}
	return s.repo.List(ctx, limit, offset)
}

func (s *PersonService) Create(ctx context.Context, p domain.User) (*domain.User, error) {
	if err := s.repo.Create(ctx, p); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			return nil, domain.ErrConflict
		}
		return nil, err
	}
	return &p, nil
}
