package blank

import (
	"os"
	"fmt"
	"bytes"
	"net/http"
	"html/template"

	"blank/transport"
	"blank/components"

	"github.com/gorilla/mux"
	log "github.com/Sirupsen/logrus"
	"github.com/miketheprogrammer/go-thrust/thrust"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

// Blank is the main entity
type Blank struct {
	addr       string
	debug      bool
	config     *config
	tunnel     *transport.Tunnel
}

// NewBlank initializes a new BlankEditor
func NewBlank(addr string, debug bool, configFile string) (*Blank, error) {
	c, err := newConfig(bytes.NewReader(loadConfig(configFile)))
	if err != nil {
		return nil, err
	}

	b := &Blank{
		addr:    addr,
		debug:   debug,
		config:  c,
	}

	return b, nil
}

// Start initializes thrust and starts the http server
func (b *Blank) Start() error {
	// load config
	if err := b.initThrust(); err != nil {
		return err
	}

	for _, c := range components.Components() {
		c.Setup(b, b.tunnel)
	}

	return b.startHTTP()
}

// Stop tears down all components and finally stops thrust and webserver
func (b *Blank) Stop() {
	// TODO graceful shutdown (teardown http, then exit)
	log.Println("shutting down...")

	for _, c := range components.Components() {
		c.Teardown()
	}

	thrust.Exit()
	os.Exit(0)
}

func (b *Blank) initThrust() error {
	thrust.SetProvisioner(NewDefaultProvisioner())
	thrust.Start()

	thrustWindow := thrust.NewWindow(thrust.WindowOptions{
		RootUrl: fmt.Sprintf("http://%s", b.addr),
	})

	thrustWindow.Show()
	thrustWindow.Maximize()
	thrustWindow.Focus()

	if b.debug {
		thrustWindow.OpenDevtools()
	}

	b.tunnel = transport.NewTunnel(thrustWindow)
	_, err := thrustWindow.HandleRemote(b.tunnel.OnRemote)
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
