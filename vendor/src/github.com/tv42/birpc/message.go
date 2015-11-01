package birpc

import (
	"fmt"
)

// Message is the on-wire description of a method call or result.
//
// Examples:
//
//   {"id":"1","fn":"Arith.Add","args":{"A":1,"B":1}}
//   {"id":"1","result":{"C":2}}
//
// or
//
//   {"id":"1","error":{"msg":"Math is hard, let's go shopping"}}
type Message struct {
	// 0 or omitted for untagged request (untagged response is illegal).
	ID uint64 `json:"id,string,omitempty"`

	// Name of the function to call. If set, this is a request; if
	// unset, this is a response.
	Func string `json:"fn,omitempty"`

	// Arguments for the RPC call. Only valid for a request.
	Args interface{} `json:"args,omitempty"`

	// Result of the function call. A response will always have
	// either Result or Error set. Only valid for a response.
	Result interface{} `json:"result,omitempty"`

	// Information on how the call failed. Only valid for a
	// response. Must be present if Result is omitted.
	Error *Error `json:"error,omitempty"`
}

// Error is the on-wire description of an error that occurred while
// serving the method call.
type Error struct {
	Msg string `json:"msg,omitempty"`

	// more fields may be added later

	// TODO ponder about error detail, way for clients to tell
	// transient/permanent, bad request vs out of memory
}

func (e Error) Error() string {
	return e.Msg
}

func (e Error) GoString() string {
	return fmt.Sprintf("%T{Msg: %q}", e, e.Msg)
}
