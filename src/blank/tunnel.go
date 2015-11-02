package blank

import (
	"encoding/json"
	"log"

	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

// HandlerFunc describes a command handler for Thrust communication
type HandlerFunc func(*Command) error

// Command is the container through which backend and frontend communicate
type Command struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}

type tunnel struct {
	window   *window.Window
	registry map[string][]HandlerFunc
}

func newTunnel(w *window.Window) *tunnel {
	return &tunnel{window: w, registry: make(map[string][]HandlerFunc)}
}

func (t *tunnel) onRemote(e commands.EventResult, this *window.Window) {
	c := &Command{}

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

func (t *tunnel) RegisterHandler(topic string, h HandlerFunc) {
	t.registry[topic] = append(t.registry[topic], h)
}

func (t *tunnel) SendCommand(c *Command) error {
	buf, err := json.Marshal(c)
	if err != nil {
		return err
	}

	t.window.SendRemoteMessage(string(buf))
	return nil
}
