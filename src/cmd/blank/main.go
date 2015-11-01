package main

import (
	"blank"
	"flag"
	"log"
)

func main() {
	addr := flag.String("addr", "localhost:3007", "address of http server")
	headless := flag.Bool("headless", false, "start in headless mode")
	configFile := flag.String("config", "~/.blank/config.yaml", "path to config file")

	flag.Parse()

	editor := blank.NewEditor(*addr, *headless, *configFile)
	if err := editor.Start(); err != nil {
		log.Fatal(err)
	}
}
