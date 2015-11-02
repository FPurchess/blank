package blank

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"

	"provisioner"

	"github.com/gorilla/mux"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
	"github.com/miketheprogrammer/go-thrust/thrust"
)

// Editor main entity
type Editor struct {
	addr       string
	debug      bool
	configFile string
	config     *config
	tunnel     *tunnel
}

// NewEditor initializes a new BlankEditor
func NewEditor(addr string, debug bool, configFile string) *Editor {
	return &Editor{addr: addr, debug: debug, configFile: configFile}
}

// Start initializes thrust and starts the http server
func (b *Editor) Start() error {
	// load config
	f, err := os.Open(b.configFile)
	if err != nil {
		return err
	}

	b.config, err = newConfig(f)
	if err != nil {
		return err
	}

	if err := b.initThrust(); err != nil {
		return err
	}

	// finally, fire http
	return b.startHTTP()
}

// Stop gracefully stops editor
func (b *Editor) Stop() {
	// TODO graceful shutdown (teardown http, then exit)
	log.Println("bye bye...")
	thrust.Exit()
	os.Exit(0)
}

func (b *Editor) initThrust() error {
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
	b.tunnel = newTunnel(thrustWindow)
	_, err := thrustWindow.HandleRemote(b.tunnel.onRemote)
	if err != nil {
		return err
	}

	// bind close event
	thrust.NewEventHandler("closed", func(cr commands.EventResult) {
		b.Stop()
	})

	return nil
}

func (b *Editor) startHTTP() error {
	r := mux.NewRouter()
	r.HandleFunc("/", b.serveHome)
	r.PathPrefix("/public/").Handler(http.StripPrefix("/public/", http.FileServer(http.Dir("./public/"))))

	log.Printf("Starting blank editor at http://%s/", b.addr)

	return http.ListenAndServe(b.addr, r)
}

func (b *Editor) serveHome(w http.ResponseWriter, r *http.Request) {
	t := template.New("index.html")
	t, err := t.ParseFiles("tmpl/index.html")
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	template.Must(t, t.Execute(w, b.config))
}
