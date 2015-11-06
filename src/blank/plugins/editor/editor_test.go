package editor

import (
	"blank"
	"strings"
	"testing"

	"github.com/facebookgo/ensure"
)

func TestInitRegistersHandler(t *testing.T) {
	e := NewEditor()

	// TODO mock blank
	b, err := blank.NewBlank("", false, strings.NewReader(""), []blank.Plugin{})
	ensure.Nil(t, err)

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
