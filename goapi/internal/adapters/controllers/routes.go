package controllers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimid "github.com/go-chi/chi/v5/middleware"
)

type Deps struct {
	Person *PersonController
}

func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(chimid.RequestID)
	r.Use(chimid.RealIP)
	r.Use(chimid.Recoverer)
	r.Use(chimid.Timeout(10 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Mount("/persons", d.Person.Routes())
	})

	return r
}
