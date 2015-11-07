package main

import (
	"flag"
	_log "log"
	"os"
	"strings"

	log "github.com/Sirupsen/logrus"
	"github.com/miketheprogrammer/go-thrust/lib/common"

	"blank"
	"blank/plugins/editor"
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
