package main

import (
	"context"
	"fmt"
	"scripts/deputies"
	"time"
)

func main() {
	// Global timeout for the whole operation.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	data, err := deputies.RetrieveAllDeputies(ctx)
	if err != nil {
		panic(err)
	}

	fmt.Println("TOTAL DEPUTADOS:", len(data))

	for i, p := range data {
		fmt.Println(i, p.ID, p.Name, p.Party, p.Uf, p.PhotoURL)
	}
}
