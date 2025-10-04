package main

import (
	"github.com/acompahe-seu-deputado/mobileapi"
)

func main() {
	mobileapi.StartServer()

	select {}
}
