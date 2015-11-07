package editor

import (
	"blank"

	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
)

// Editor plugin
type Editor struct {
	blank *blank.Blank
}

// NewEditor returns an Editor plugin
func NewEditor() Editor {
	return Editor{}
}

// Init sets up the plugin and registers all commands
func (e Editor) Init(b *blank.Blank) {
	e.blank = b

	e.blank.Tunnel.RegisterHandler("save", e.onSave)
	e.blank.Tunnel.RegisterHandler("open", e.onOpen)
	e.blank.Tunnel.RegisterHandler("exit", e.onExit)
}

func (e Editor) onSave(this *window.Window, c *blank.Command) error {
	// TODO implement
	return nil
}

func (e Editor) onOpen(this *window.Window, c *blank.Command) error {
	// TODO implement
	return nil
}

func (e Editor) onExit(this *window.Window, c *blank.Command) error {
	e.blank.Stop()
	return nil
}
