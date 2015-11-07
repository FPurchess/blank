package editor

import (
	"blank"

	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

// Editor plugin
type Editor struct {
	blank        *blank.Blank
	isFullscreen bool
	isDevtools   bool
}

// NewEditor returns an Editor plugin
func NewEditor() *Editor {
	return &Editor{
		isFullscreen: false,
		isDevtools:   false,
	}
}

// Init sets up the plugin and registers all commands
func (e *Editor) Init(b *blank.Blank) {
	e.blank = b

	e.blank.Tunnel.RegisterHandler("save", e.onSave)
	e.blank.Tunnel.RegisterHandler("open", e.onOpen)
	e.blank.Tunnel.RegisterHandler("exit", e.onExit)
	e.blank.Tunnel.RegisterHandler("fullscreen", e.onFullscreen)
	e.blank.Tunnel.RegisterHandler("devtools", e.onDevtools)
}

func (e *Editor) onSave(this *window.Window, c *blank.Command) error {
	// TODO implement
	return nil
}

func (e *Editor) onOpen(this *window.Window, c *blank.Command) error {
	// TODO implement
	return nil
}

func (e *Editor) onExit(this *window.Window, c *blank.Command) error {
	e.blank.Stop()
	return nil
}

func (e *Editor) onFullscreen(this *window.Window, c *blank.Command) error {
	e.isFullscreen = !e.isFullscreen

	if e.isFullscreen {
		this.Fullscreen()
	} else {
		// TODO workaround to leave fullscreen mode
		// waiting for PR https://github.com/miketheprogrammer/go-thrust/pull/61
		command := commands.Command{
			Method: "set_fullscreen",
			Args: commands.CommandArguments{
				Fullscreen: false,
			},
		}

		this.CallWhenDisplayed(&command)
		this.Maximize()
	}

	return nil
}

func (e *Editor) onDevtools(this *window.Window, c *blank.Command) error {
	e.isDevtools = !e.isDevtools

	if e.isDevtools {
		this.OpenDevtools()
	} else {
		this.CloseDevtools()
	}

	return nil
}
