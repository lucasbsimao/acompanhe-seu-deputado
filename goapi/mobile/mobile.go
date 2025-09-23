package mobile

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Person struct {
	Name  string `json:"name"`
	Party string `json:"party"`
}

var started atomic.Bool

func StartServer(addr string) {
	if addr == "" {
		addr = ":8080"
	}

	if !started.CompareAndSwap(false, true) {
		log.Printf("[GoAPI] StartServer called more than once; reusing existing server on %s", addr)
		return
	}

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(10 * time.Second))

	r.Get("/person", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(Person{
			Name:  "Teste",
			Party: "Partido Exemplo",
		})
	})

	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	go func() {
		log.Printf("[GoAPI] Starting server on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[GoAPI] server stopped: %v", err)
		}
	}()
}
