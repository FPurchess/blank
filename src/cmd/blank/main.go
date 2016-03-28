package main

import (
	"os"
	"flag"
	"strings"
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

	// load config
	conf, err := os.Open(strings.Replace(*configFile, "~", os.Getenv("HOME"), -1))
	if err != nil {
		log.Fatal(err)
	}

	// start editor
	editor, err := blank.NewBlank(*addr, *debug, conf)
	if err != nil {
		log.Fatal(err)
	}

	if err := editor.Start(); err != nil {
		log.Fatal(err)
	}
}
