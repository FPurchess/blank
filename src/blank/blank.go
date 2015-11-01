package blank

import (
	"encoding/json"
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
	httpAddr string
}

// NewEditor initializes a new BlankEditor
func NewEditor(addr string) *Editor {
	return &Editor{httpAddr: addr}
}

// Start initializes thrust and starts the http server
func (b *Editor) Start() error {
	b.initThrust()
	return b.startHTTP()
}

func (b *Editor) initThrust() {
	thrust.InitLogger()
	thrust.SetProvisioner(provisioner.NewDefaultProvisioner())
	thrust.Start()

	thrustWindow := thrust.NewWindow(thrust.WindowOptions{
		RootUrl: fmt.Sprintf("http://%s", b.httpAddr),
	})

	thrustWindow.Show()
	thrustWindow.Maximize()
	thrustWindow.Focus()

	// FIXME perform a graceful shutdown here -- ATTENTION: does not execute deferred funcs
	thrust.NewEventHandler("closed", func(cr commands.EventResult) {
		os.Exit(0)
	})
}

func (b *Editor) startHTTP() error {
	r := mux.NewRouter()
	r.HandleFunc("/", b.serveHome)
	r.PathPrefix("/public/").Handler(http.StripPrefix("/public/", http.FileServer(http.Dir("./public/"))))

	log.Printf("Starting blank editor at http://%s/", b.httpAddr)

	return http.ListenAndServe(b.httpAddr, r)
}

func (b *Editor) serveHome(w http.ResponseWriter, r *http.Request) {
	t := template.New("index.html")
	t, err := t.ParseFiles("tmpl/index.html")
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// TODO pass a configuration
	c, err := json.Marshal(struct{}{})
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	template.Must(t, t.Execute(w, string(c)))
}
