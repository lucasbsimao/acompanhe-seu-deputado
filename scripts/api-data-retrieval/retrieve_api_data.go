package main

import (
	"context"
	"scripts/deputies"
	"time"
)

func main() {
	// Global timeout for the whole operation.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err := deputies.RetrieveAllDeputies(ctx)
	if err != nil {
		panic(err)
	}
}
