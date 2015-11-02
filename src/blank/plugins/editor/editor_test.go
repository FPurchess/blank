package editor

import (
	"blank"
	"testing"
)

func TestInitRegistersHandler(t *testing.T) {
	e := NewEditor()

	b := blank.NewBlank("", false, "", []blank.Plugin{})
	b.Tunnel = blank.NewTunnel(nil)
	e.Init(b)

	// TODO assertion
}
