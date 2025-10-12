package services

import (
	"context"
	"errors"

	"github.com/acompahe-seu-deputado/internal/domain"
	"github.com/acompahe-seu-deputado/internal/ports/repositories"
)

type PersonService struct {
	repo repositories.PersonRepo
}

func NewPersonService(repo repositories.PersonRepo) *PersonService {
	return &PersonService{repo: repo}
}

func (s *PersonService) Get(ctx context.Context, id string) (*domain.Person, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *PersonService) List(ctx context.Context, limit, offset int) ([]domain.Person, error) {
	if limit <= 0 || limit > 1000 {
		return nil, domain.ErrValidation
	}
	return s.repo.List(ctx, limit, offset)
}

func (s *PersonService) Create(ctx context.Context, p domain.Person) (*domain.Person, error) {
	if p.Name == "" {
		return nil, domain.ErrValidation
	}
	// could check duplicates, etc.
	if err := s.repo.Create(ctx, p); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			return nil, domain.ErrConflict
		}
		return nil, err
	}
	return &p, nil
}
