package wetsock

import (
	"encoding/json"
	"errors"
	"reflect"

	"github.com/gorilla/websocket"
	"github.com/tv42/birpc"
)

type codec struct {
	WS *websocket.Conn
}

// This is ugly, but i need to override the unmarshaling logic for
// Args and Result, or they'll end up as map[string]interface{}.
// Perhaps some day encoding/json will support embedded structs, and I
// can embed birpc.Message and just override the two fields I need to
// change.
type jsonMessage struct {
	ID     uint64          `json:"id,string,omitempty"`
	Func   string          `json:"fn,omitempty"`
	Args   json.RawMessage `json:"args,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *birpc.Error    `json:"error"`
}

func (c *codec) ReadMessage(msg *birpc.Message) error {
	var jm jsonMessage
	err := c.WS.ReadJSON(&jm)
	if err != nil {
		return err
	}
	msg.ID = jm.ID
	msg.Func = jm.Func
	msg.Args = jm.Args
	msg.Result = jm.Result
	msg.Error = jm.Error
	return nil
}

func (c *codec) WriteMessage(msg *birpc.Message) error {
	return c.WS.WriteJSON(msg)
}

func (c *codec) Close() error {
	return c.WS.Close()
}

func (c *codec) UnmarshalArgs(msg *birpc.Message, args interface{}) error {
	raw := msg.Args.(json.RawMessage)
	if raw == nil {
		return nil
	}
	err := json.Unmarshal(raw, args)
	return err
}

func (c *codec) UnmarshalResult(msg *birpc.Message, result interface{}) error {
	raw := msg.Result.(json.RawMessage)
	if raw == nil {
		return errors.New("birpc.jsonmsg response must set result")
	}
	err := json.Unmarshal(raw, result)
	return err
}

func (c *codec) FillArgs(arglist []reflect.Value) error {
	for i := 0; i < len(arglist); i++ {
		switch arglist[i].Interface().(type) {
		case *websocket.Conn:
			arglist[i] = reflect.ValueOf(c.WS)
		}
	}
	return nil
}

// TODO don't need a struct, or this function, just a type alias
func NewCodec(ws *websocket.Conn) *codec {
	c := &codec{
		WS: ws,
	}
	return c
}

func NewEndpoint(registry *birpc.Registry, ws *websocket.Conn) *birpc.Endpoint {
	c := NewCodec(ws)
	e := birpc.NewEndpoint(c, registry)
	return e
}
