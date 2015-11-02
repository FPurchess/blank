package blank

import (
	"encoding/json"
	"log"

	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

type handlerFunc func(*command) error

type command struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}

type tunnel struct {
	window   *window.Window
	registry map[string][]handlerFunc
}

func newTunnel(w *window.Window) *tunnel {
	return &tunnel{window: w, registry: make(map[string][]handlerFunc)}
}

func (t *tunnel) onRemote(e commands.EventResult, this *window.Window) {
	c := &command{}

	// extract command from payload
	err := json.Unmarshal([]byte(e.Message.Payload), c)
	if err != nil {
		log.Println("failed to handle remote command: ", e.Message.Payload)
		return
	}

	// broadcast command
	if handlers, ok := t.registry[c.Topic]; ok {
		for _, handler := range handlers {
			handler(c)
		}
	}
}

func (t *tunnel) registerHandler(topic string, h handlerFunc) {
	t.registry[topic] = append(t.registry[topic], h)
}

func (t *tunnel) sendCommand(c *command) error {
	buf, err := json.Marshal(c)
	if err != nil {
		return err
	}

	t.window.SendRemoteMessage(string(buf))
	return nil
}
