package editor

import "blank"

// Editor plugin
type Editor struct {
	blank *blank.Blank
}

// NewEditor returns an Editor plugin
func NewEditor() Editor {
	return Editor{}
}

func (e Editor) Init(b *blank.Blank) {
	e.blank = b

	e.blank.Tunnel.RegisterHandler("save", e.onSave)
	e.blank.Tunnel.RegisterHandler("open", e.onOpen)
	e.blank.Tunnel.RegisterHandler("exit", e.onExit)
}

func (e Editor) onSave(c *blank.Command) error {
	return nil
}

func (e Editor) onOpen(c *blank.Command) error {
	return nil
}

func (e Editor) onExit(c *blank.Command) error {
	e.blank.Stop()
	return nil
}
