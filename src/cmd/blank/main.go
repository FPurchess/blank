package main

import (
	"flag"
	_log "log"

	"blank"

	log "github.com/Sirupsen/logrus"
	"github.com/miketheprogrammer/go-thrust/lib/common"
)

func main() {
	addr := flag.String("addr", "localhost:3007", "address of http server")
	debug := flag.Bool("debug", false, "start in debug mode")
	configFile := flag.String("config", "~/.blank/config.yaml", "path to config file")
	flag.Parse()

	// setup logging
	if *debug {
		log.SetLevel(log.DebugLevel)
	}
	w := log.StandardLogger().Writer()
	defer w.Close()
	common.Log = _log.New(w, "", 0)

	// start editor
	editor, err := blank.NewBlank(*addr, *debug, *configFile)
	if err != nil {
		log.Fatalf("failed to initialize blank: %v", err)
	}

	if err := editor.Start(); err != nil {
		log.Fatalf("failed to start blank: %v", err)
	}
}
