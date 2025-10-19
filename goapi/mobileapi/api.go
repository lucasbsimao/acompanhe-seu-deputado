package mobileapi

import (
	"context"
	"log"

	"sync/atomic"

	"github.com/acompahe-seu-deputado/internal/adapters/controllers"
	"github.com/acompahe-seu-deputado/internal/adapters/repositories/sqlite"
	"github.com/acompahe-seu-deputado/internal/migrations"
	"github.com/acompahe-seu-deputado/internal/server"
	"github.com/acompahe-seu-deputado/internal/services"
)

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
		log.Printf("[GoAPI] already running at %s", Addr())
		return
	}

	db, _ := sqlite.Open(sqlite.Options{Path: "file:acompanheseudeputado.db?_pragma=busy_timeout(5000)"})
	if err := migrations.Apply(context.Background(), db); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	repo := sqlite.NewPersonRepo(db)
	svc := services.NewPersonService(repo)
	ph := controllers.NewPersonController(svc)
	router := controllers.NewRouter(controllers.Deps{Person: ph})
	srv := server.New(router)

	ln, err := srv.Listen(true, "")
	if err != nil {
		started.Store(false)
		log.Printf("[GoAPI] listen error: %v", err)
		return
	}

	addr := ln.Addr().String()
	currentAddr.Store(addr)
	go func() {
		log.Printf("[GoAPI] serving at http://%s", addr)
		if err := srv.Serve(ln); err != nil && err != context.Canceled {
			log.Printf("[GoAPI] stopped: %v", err)
		}
	}()
}
