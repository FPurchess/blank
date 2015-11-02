package blank

import (
	"encoding/json"
	"log"

	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

type commandHandler interface {
	handle(c *command) error
}

type command struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}

type tunnel struct {
	receiver chan *command
	window   *window.Window
	registry map[commandHandler]string
}

func newTunnel(w *window.Window) *tunnel {
	return &tunnel{window: w}
}

func (t *tunnel) onRemote(e commands.EventResult, this *window.Window) {
	c := &command{}

	// extract command from payload
	err := json.Unmarshal([]byte(e.Message.Payload), c)
	if err != nil {
		log.Println("failed to handle remote command: ", e.Message.Payload)
		return
	}

	// broadcast command to commandHandlers
	for handler, topic := range t.registry {
		if topic == c.Topic {
			handler.handle(c)
		}
	}
}

func (t *tunnel) registerHandler(h commandHandler, topic string) {
	t.registry[h] = topic
}

func (t *tunnel) sendCommand(c *command) error {
	buf, err := json.Marshal(c)
	if err != nil {
		return err
	}

	t.window.SendRemoteMessage(string(buf))
	return nil
}
