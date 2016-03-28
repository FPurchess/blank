package components

import (
	"blank/transport"

	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
)

type editor struct {
	app          Stoppable
	tunnel       *transport.Tunnel
	isFullscreen bool
	isDevtools   bool
}

func init() {
	registerComponent("editor", &editor{
		isFullscreen: false,
		isDevtools:   false,
	})
}

func (e *editor) Setup(s Stoppable, t *transport.Tunnel) {
	e.app = s
	e.tunnel = t

	e.tunnel.RegisterHandler("save", e.onSave)
	e.tunnel.RegisterHandler("open", e.onOpen)
	e.tunnel.RegisterHandler("exit", e.onExit)
	e.tunnel.RegisterHandler("fullscreen", e.onFullscreen)
	e.tunnel.RegisterHandler("devtools", e.onDevtools)
}

func (e *editor) Teardown() {}

func (e *editor) onSave(this *window.Window, c *transport.Command) error {
	// TODO implement
	return nil
}

func (e *editor) onOpen(this *window.Window, c *transport.Command) error {
	// TODO implement
	return nil
}

func (e *editor) onExit(this *window.Window, c *transport.Command) error {
	e.app.Stop()
	return nil
}

func (e *editor) onFullscreen(this *window.Window, c *transport.Command) error {
	e.isFullscreen = !e.isFullscreen
	this.Fullscreen(e.isFullscreen)

	if !e.isFullscreen {
		this.Maximize()
	}

	return nil
}

func (e *editor) onDevtools(this *window.Window, c *transport.Command) error {
	e.isDevtools = !e.isDevtools

	if e.isDevtools {
		this.OpenDevtools()
	} else {
		this.CloseDevtools()
	}

	return nil
}
