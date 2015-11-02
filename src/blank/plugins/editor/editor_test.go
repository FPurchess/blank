package editor

import (
	"blank"
	"testing"

	"github.com/facebookgo/ensure"
)

func TestInitRegistersHandler(t *testing.T) {
	e := NewEditor()

	// TODO mock blank
	b := blank.NewBlank("", false, "", []blank.Plugin{})
	b.Tunnel = blank.NewTunnel(nil)
	e.Init(b)

	// TODO assertion
}

func TestOnSave(t *testing.T) {
	e := NewEditor()
	ensure.Nil(t, e.onSave(&blank.Command{}))
}

func TestOnOpen(t *testing.T) {
	e := NewEditor()
	ensure.Nil(t, e.onOpen(&blank.Command{}))
}
