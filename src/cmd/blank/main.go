package main

import (
	"blank"
	"blank/plugins/editor"
	"flag"
	"log"
)

func main() {
	addr := flag.String("addr", "localhost:3007", "address of http server")
	debug := flag.Bool("debug", false, "start in debug mode")
	configFile := flag.String("config", "~/.blank/config.yaml", "path to config file")

	flag.Parse()

	// TODO find a more generic solution
	plugins := []blank.Plugin{
		editor.NewEditor(),
	}

	editor := blank.NewBlank(*addr, *debug, *configFile, plugins)
	if err := editor.Start(); err != nil {
		log.Fatal(err)
	}
}
