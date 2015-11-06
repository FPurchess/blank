package main

import (
	"blank"
	"blank/plugins/editor"
	"flag"
	"log"
	"os"
	"strings"
)

func main() {
	addr := flag.String("addr", "localhost:3007", "address of http server")
	debug := flag.Bool("debug", false, "start in debug mode")
	configFile := flag.String("config", "~/.blank/config.yaml", "path to config file")

	flag.Parse()

	// load config
	conf, err := os.Open(strings.Replace(*configFile, "~", os.Getenv("HOME"), -1))
	if err != nil {
		log.Fatal(err)
	}

	// prepare plugins
	// TODO find a more generic solution
	plugins := []blank.Plugin{
		editor.NewEditor(),
	}

	// start editor
	editor, err := blank.NewBlank(*addr, *debug, conf, plugins)
	if err != nil {
		log.Fatal(err)
	}

	if err := editor.Start(); err != nil {
		log.Fatal(err)
	}
}
