package blank

import (
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"

	"provisioner"

	"github.com/gorilla/mux"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
	"github.com/miketheprogrammer/go-thrust/thrust"
)

// Plugin implements a Blank Plugin
type Plugin interface {
	Init(b *Blank)
}

// Blank is the main entity
type Blank struct {
	addr       string
	debug      bool
	configFile io.Reader
	config     *config
	Tunnel     *Tunnel
	plugins    []Plugin
}

// NewBlank initializes a new BlankEditor
func NewBlank(addr string, debug bool, configFile io.Reader, plugins []Plugin) (*Blank, error) {
	c, err := newConfig(configFile)
	if err != nil {
		return nil, err
	}

	return &Blank{
		addr:    addr,
		debug:   debug,
		config:  c,
		plugins: plugins,
	}, nil
}

// Start initializes thrust and starts the http server
func (b *Blank) Start() error {
	// load config
	if err := b.initThrust(); err != nil {
		return err
	}

	for _, plugin := range b.plugins {
		plugin.Init(b)
	}

	// finally, fire http
	return b.startHTTP()
}

// Stop gracefully stops editor
func (b *Blank) Stop() {
	// TODO graceful shutdown (teardown http, then exit)
	log.Println("bye bye...")
	thrust.Exit()
	os.Exit(0)
}

func (b *Blank) initThrust() error {
	thrust.InitLogger()
	thrust.SetProvisioner(provisioner.NewDefaultProvisioner())
	thrust.Start()

	// init window
	thrustWindow := thrust.NewWindow(thrust.WindowOptions{
		RootUrl: fmt.Sprintf("http://%s", b.addr),
	})

	thrustWindow.Show()
	thrustWindow.Maximize()
	thrustWindow.Focus()

	// debug mode
	if b.debug {
		thrustWindow.OpenDevtools()
	}

	// register tunnel
	b.Tunnel = NewTunnel(thrustWindow)
	_, err := thrustWindow.HandleRemote(b.Tunnel.onRemote)
	if err != nil {
		return err
	}

	// bind close event
	thrust.NewEventHandler("closed", func(cr commands.EventResult) {
		b.Stop()
	})

	return nil
}

func (b *Blank) startHTTP() error {
	r := mux.NewRouter()
	r.HandleFunc("/", b.serveHome)
	r.HandleFunc("/public/app.js", func(w http.ResponseWriter, r *http.Request) {
		data, err := Asset("public/app.js")
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "text/javascript")
		w.Write(data)
	})

	log.Printf("Starting blank editor at http://%s/", b.addr)
	return http.ListenAndServe(b.addr, r)
}

func (b *Blank) serveHome(w http.ResponseWriter, r *http.Request) {
	data, err := Asset("tmpl/index.html")
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	t, err := template.New("index.html").Parse(string(data))
	if err != nil {
		log.Println(err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	template.Must(t, t.Execute(w, b.config))
}
