package blank

import (
	"testing"

	"github.com/facebookgo/ensure"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

func TestRegisterHandler(t *testing.T) {
	tun := newTunnel(nil)

	ensure.DeepEqual(t, len(tun.registry), 0)
	tun.registerHandler("a-topic", func(c *command) error {
		return nil
	})
	tun.registerHandler("another-topic", func(c *command) error {
		return nil
	})
	ensure.DeepEqual(t, len(tun.registry), 2)
}

func TestOnRemotePassesCommands(t *testing.T) {
	calls := 0
	tun := newTunnel(nil)

	tun.registerHandler("a-topic", func(c *command) error {
		calls++
		return nil
	})
	tun.registerHandler("another-topic", func(c *command) error {
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
