package mobile

import (
	"encoding/json"
	"log"
	"net"
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

var (
	started     atomic.Bool
	currentAddr atomic.Value
)

func Addr() string {
	if v := currentAddr.Load(); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func StartServer() {
	if !started.CompareAndSwap(false, true) {
		log.Printf("[GoAPI] StartServer called more than once; keeping server at %s", Addr())
		return
	}

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(10 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Get("/person", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(Person{
			Name:  "Teste",
			Party: "Partido Exemplo",
		})
	})

	srv := &http.Server{
		Handler:      r,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	// Bind to loopback, port 0 (OS picks a free port)
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		log.Printf("[GoAPI] listen error: %v", err)
		started.Store(false)
		return
	}

	chosen := ln.Addr().String()
	currentAddr.Store(chosen)

	go func() {
		log.Printf("[GoAPI] Serving on http://%s (loopback only)", chosen)
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("[GoAPI] server stopped: %v", err)
		}
	}()
}
