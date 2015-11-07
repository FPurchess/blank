package blank

import (
	"encoding/json"

	log "github.com/Sirupsen/logrus"
	"github.com/miketheprogrammer/go-thrust/lib/bindings/window"
	"github.com/miketheprogrammer/go-thrust/lib/commands"
)

// HandlerFunc describes a command handler for Thrust communication
type HandlerFunc func(*window.Window, *Command) error

// Command is the container through which backend and frontend communicate
type Command struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}

// Tunnel acts as the communication pipeline between backend and frontend
type Tunnel struct {
	window   *window.Window
	registry map[string][]HandlerFunc
}

// NewTunnel initializes a new communication tunnel
func NewTunnel(w *window.Window) *Tunnel {
	return &Tunnel{window: w, registry: make(map[string][]HandlerFunc)}
}

func (t *Tunnel) onRemote(e commands.EventResult, this *window.Window) {
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
			handler(this, c)
		}
	}
}

// RegisterHandler subscribes a command handler on a specific topic
func (t *Tunnel) RegisterHandler(topic string, h HandlerFunc) {
	t.registry[topic] = append(t.registry[topic], h)
	log.Debug("registered handler on topic: " + topic)
}

// SendCommand sends a command to the frontend
func (t *Tunnel) SendCommand(c *Command) error {
	buf, err := json.Marshal(c)
	if err != nil {
		return err
	}

	t.window.SendRemoteMessage(string(buf))
	return nil
}
