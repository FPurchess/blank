package transport

import (
	"testing"

	"github.com/facebookgo/ensure"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
	"reflect"
)

func TestNewTunnel(t *testing.T) {
	got := reflect.TypeOf(NewTunnel(nil))
	expected := reflect.TypeOf(new(Tunnel))

	ensure.DeepEqual(t, got, expected)
}

func TestRegisterHandler(t *testing.T) {
	tun := NewTunnel(nil)

	ensure.DeepEqual(t, len(tun.registry), 0)
	tun.RegisterHandler("a-topic", func(w *window.Window, c *Command) error {
		return nil
	})
	tun.RegisterHandler("another-topic", func(w *window.Window, c *Command) error {
		return nil
	})
	ensure.DeepEqual(t, len(tun.registry), 2)
}

func TestOnRemote(t *testing.T) {
	calls := 0
	tun := NewTunnel(nil)

	tun.RegisterHandler("a-topic", func(w *window.Window, c *Command) error {
		calls++
		return nil
	})
	tun.RegisterHandler("another-topic", func(w *window.Window, c *Command) error {
		calls++
		return nil
	})

	ensure.DeepEqual(t, calls, 0)

	// receive a command
	er := commands.EventResult{}
	er.Message.Payload = "{\"topic\":\"a-topic\"}"
	tun.OnRemote(er, nil)

	ensure.DeepEqual(t, calls, 1)
}
