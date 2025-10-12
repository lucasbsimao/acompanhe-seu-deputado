package main

import (
	"context"
	"log"

	"github.com/acompahe-seu-deputado/internal/adapters/repositories/sqlite"
	"github.com/acompahe-seu-deputado/internal/migrations"
	"github.com/acompahe-seu-deputado/mobileapi"
)

func main() {
	db, _ := sqlite.Open(sqlite.Options{Path: "file:dev.db?_pragma=busy_timeout(5000)"})
	if err := migrations.Apply(context.Background(), db); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	mobileapi.StartServer()

	select {}
}
