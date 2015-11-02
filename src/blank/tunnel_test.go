package blank

import (
	"testing"

	"github.com/facebookgo/ensure"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

func TestRegisterHandler(t *testing.T) {
	tun := NewTunnel(nil)

	ensure.DeepEqual(t, len(tun.registry), 0)
	tun.RegisterHandler("a-topic", func(c *Command) error {
		return nil
	})
	tun.RegisterHandler("another-topic", func(c *Command) error {
		return nil
	})
	ensure.DeepEqual(t, len(tun.registry), 2)
}

func TestOnRemotePassesCommands(t *testing.T) {
	calls := 0
	tun := NewTunnel(nil)

	tun.RegisterHandler("a-topic", func(c *Command) error {
		calls++
		return nil
	})
	tun.RegisterHandler("another-topic", func(c *Command) error {
		calls++
		return nil
	})

	ensure.DeepEqual(t, calls, 0)

	// receive a command
	er := commands.EventResult{}
	er.Message.Payload = "{\"topic\":\"a-topic\"}"
	tun.onRemote(er, nil)

	ensure.DeepEqual(t, calls, 1)
}
