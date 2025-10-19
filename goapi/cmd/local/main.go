package main

import (
	"github.com/acompahe-seu-deputado/mobileapi"
)

func main() {
	// db, _ := sqlite.Open(sqlite.Options{Path: "file:dev.db?_pragma=busy_timeout(5000)"})
	// if err := migrations.Apply(context.Background(), db); err != nil {
	// 	log.Fatalf("migrate: %v", err)
	// }

	// repo := sqlite.NewPersonRepo(db)
	// svc := services.NewPersonService(repo)
	// ph := controllers.NewPersonController(svc)
	// router := controllers.NewRouter(controllers.Deps{Person: ph})
	// srv := server.New(router)

	// ln, err := srv.Listen(true, "")

	// if err != nil {
	// 	log.Fatalf("listen: %v", err)
	// }
	// addr := ln.Addr().String()
	// log.Printf("[Dev] serving at http://%s", addr)

	mobileapi.StartServer()

	select {}
}
