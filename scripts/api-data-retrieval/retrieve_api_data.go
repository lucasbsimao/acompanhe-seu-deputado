package main

import (
	"context"
	etl "scripts/etl_strategies"

	"time"
)

func main() {
	// Global timeout for the whole operation.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err := etl.RetrieveAllDeputies(ctx)
	if err != nil {
		panic(err)
	}
}
