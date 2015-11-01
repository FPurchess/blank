package birpc_test

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"reflect"
	"testing"

	"github.com/tv42/birpc"
	"github.com/tv42/birpc/jsonmsg"
)

// Generic reply parsing
type LowLevelReply struct {
	Id     uint64          `json:"id,string"`
	Result json.RawMessage `json:"result"`
	Error  *birpc.Error    `json:"error"`
}

type WordLengthRequest struct {
	Word string
}

type WordLengthReply struct {
	Length int
}

type WordLength_LowLevelReply struct {
	Id     uint64          `json:"id,string"`
	Result WordLengthReply `json:"result"`
	Error  *birpc.Error    `json:"error"`
}

type WordLength struct{}

func (_ WordLength) Len(request *WordLengthRequest, reply *WordLengthReply) error {
	reply.Length = len(request.Word)
	return nil
}

// this is here only to trigger a bug where all methods are thought to
// be rpc methods
func (_ WordLength) redHerring() {
}

func makeRegistry() *birpc.Registry {
	r := birpc.NewRegistry()
	r.RegisterService(WordLength{})
	return r
}

const PALINDROME = `{"id": "42", "fn": "WordLength.Len", "args": {"Word": "saippuakauppias"}}` + "\n"

func TestServerSimple(t *testing.T) {
	c, s := net.Pipe()
	defer c.Close()
	registry := makeRegistry()
	server := birpc.NewEndpoint(jsonmsg.NewCodec(s), registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	io.WriteString(c, PALINDROME)

	var reply WordLength_LowLevelReply
	dec := json.NewDecoder(c)
	if err := dec.Decode(&reply); err != nil && err != io.EOF {
		t.Fatalf("decode failed: %s", err)
	}
	t.Logf("reply msg: %#v", reply)
	if reply.Error != nil {
		t.Fatalf("unexpected error response: %v", reply.Error)
	}
	if reply.Result.Length != 15 {
		t.Fatalf("got wrong answer: %v", reply.Result.Length)
	}

	c.Close()

	err := <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from ServeCodec: %v", err)
	}
}

func TestClient(t *testing.T) {
	c, s := net.Pipe()
	defer c.Close()
	registry := makeRegistry()
	server := birpc.NewEndpoint(jsonmsg.NewCodec(s), registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	client := birpc.NewEndpoint(jsonmsg.NewCodec(c), nil)
	client_err := make(chan error)
	go func() {
		client_err <- client.Serve()
	}()

	// Synchronous calls
	args := &WordLengthRequest{"xyzzy"}
	reply := &WordLengthReply{}
	err := client.Call("WordLength.Len", args, reply)
	if err != nil {
		t.Errorf("unexpected error from call: %v", err.Error())
	}
	if reply.Length != 5 {
		t.Fatalf("got wrong answer: %v", reply.Length)
	}

	c.Close()

	err = <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from peer ServeCodec: %v", err)
	}

	err = <-client_err
	if err != io.ErrClosedPipe {
		t.Fatalf("unexpected error from local ServeCodec: %v", err)
	}
}

func TestClientNilResult(t *testing.T) {
	c, s := net.Pipe()
	defer c.Close()
	registry := makeRegistry()
	server := birpc.NewEndpoint(jsonmsg.NewCodec(s), registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	client := birpc.NewEndpoint(jsonmsg.NewCodec(c), nil)
	client_err := make(chan error)
	go func() {
		client_err <- client.Serve()
	}()

	// Synchronous calls
	args := &WordLengthRequest{"xyzzy"}
	err := client.Call("WordLength.Len", args, nil)
	if err != nil {
		t.Errorf("unexpected error from call: %v", err.Error())
	}

	c.Close()

	err = <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from peer ServeCodec: %v", err)
	}

	err = <-client_err
	if err != io.ErrClosedPipe {
		t.Fatalf("unexpected error from local ServeCodec: %v", err)
	}
}

type EndpointPeer struct {
	seen *birpc.Endpoint
}

type nothing struct{}

func (e *EndpointPeer) Poke(request *nothing, reply *nothing, endpoint *birpc.Endpoint) error {
	if e.seen != nil {
		panic("poke called twice")
	}
	e.seen = endpoint
	return nil
}

func TestServerEndpointArg(t *testing.T) {
	peer := &EndpointPeer{}
	registry := birpc.NewRegistry()
	registry.RegisterService(peer)

	c, s := net.Pipe()
	defer c.Close()

	server := birpc.NewEndpoint(jsonmsg.NewCodec(s), registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	io.WriteString(c, `{"id":"42","fn":"EndpointPeer.Poke","args":{}}`)

	var reply LowLevelReply
	dec := json.NewDecoder(c)
	if err := dec.Decode(&reply); err != nil && err != io.EOF {
		t.Fatalf("decode failed: %s", err)
	}
	t.Logf("reply msg: %#v", reply)
	if reply.Error != nil {
		t.Fatalf("unexpected error response: %v", reply.Error)
	}
	c.Close()

	err := <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from ServeCodec: %v", err)
	}

	if peer.seen == nil {
		t.Fatalf("peer never saw a birpc.Endpoint")
	}
}

type Failing struct{}

func (_ Failing) Fail(request *nothing, reply *nothing) error {
	return errors.New("intentional")
}

func TestServerError(t *testing.T) {
	c, s := net.Pipe()
	defer c.Close()
	registry := birpc.NewRegistry()
	registry.RegisterService(Failing{})
	server := birpc.NewEndpoint(jsonmsg.NewCodec(s), registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	const REQ = `{"id": "42", "fn": "Failing.Fail", "args": {}}` + "\n"
	io.WriteString(c, REQ)

	var reply LowLevelReply
	dec := json.NewDecoder(c)
	if err := dec.Decode(&reply); err != nil && err != io.EOF {
		t.Fatalf("decode failed: %s", err)
	}
	t.Logf("reply msg: %#v", reply)
	if reply.Error == nil {
		t.Fatalf("expected an error")
	}
	if g, e := reply.Error.Msg, "intentional"; g != e {
		t.Fatalf("unexpected error response: %q != %q", g, e)
	}
	if reply.Result != nil {
		t.Fatalf("got unexpected result: %v", reply.Result)
	}

	c.Close()

	err := <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from ServeCodec: %v", err)
	}
}

func TestUnmarshalArgsError(t *testing.T) {
	c, s := net.Pipe()
	defer c.Close()
	registry := birpc.NewRegistry()
	registry.RegisterService(WordLength{})
	server := birpc.NewEndpoint(jsonmsg.NewCodec(s), registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	const REQ = `{"id": "42", "fn": "WordLength.Len", "args": "evil"}` + "\n"
	io.WriteString(c, REQ)

	var reply LowLevelReply
	dec := json.NewDecoder(c)
	if err := dec.Decode(&reply); err != nil && err != io.EOF {
		t.Fatalf("decode failed: %s", err)
	}
	t.Logf("reply msg: %#v", reply)
	if reply.Error == nil {
		t.Fatalf("expected an error")
	}
	if reply.Result != nil {
		t.Fatalf("got unexpected result: %v", reply.Result)
	}

	c.Close()

	err := <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from ServeCodec: %v", err)
	}
}

type BadFillArgsCodec struct {
	birpc.Codec
}

var _ birpc.FillArgser = BadFillArgsCodec{}

func (BadFillArgsCodec) FillArgs([]reflect.Value) error {
	return errors.New("intentional")
}

func TestFillArgsError(t *testing.T) {
	c, s := net.Pipe()
	defer c.Close()
	registry := birpc.NewRegistry()
	// just need anything with >2 parameters
	registry.RegisterService(&EndpointPeer{})
	jsonCodec := jsonmsg.NewCodec(s)
	codec := BadFillArgsCodec{jsonCodec}
	server := birpc.NewEndpoint(codec, registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	io.WriteString(c, `{"id":"42","fn":"EndpointPeer.Poke","args":{}}`)

	var reply LowLevelReply
	dec := json.NewDecoder(c)
	if err := dec.Decode(&reply); err != nil && err != io.EOF {
		t.Fatalf("decode failed: %s", err)
	}
	t.Logf("reply msg: %#v", reply)
	if reply.Error == nil {
		t.Fatalf("expected an error")
	}
	if reply.Result != nil {
		t.Fatalf("got unexpected result: %v", reply.Result)
	}

	c.Close()

	err := <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from ServeCodec: %v", err)
	}
}

func testPanic(t *testing.T, fn func(), want string) {
	defer func() {
		val := recover()
		if val == nil {
			t.Error("expected a panic")
			return
		}
		err, ok := val.(error)
		if !ok {
			t.Errorf("expected an error, got %#v", val)
			return
		}
		if g, e := err.Error(), want; g != e {
			t.Errorf("wrong error: %q != %q", g, e)
			return
		}
	}()
	fn()
}

type TooFewArguments struct{}

func (TooFewArguments) TooFew() {}

func TestRegisterBadTooFewArguments(t *testing.T) {
	registry := birpc.NewRegistry()
	testPanic(
		t,
		func() { registry.RegisterService(TooFewArguments{}) },
		"birpc.RegisterService: method birpc_test.TooFewArguments.TooFew is missing request/reply arguments",
	)
}

type NonPointerReply struct{}

func (NonPointerReply) NonPointer(args struct{}, reply struct{}) {}

func TestRegisterBadNonPointerReply(t *testing.T) {
	registry := birpc.NewRegistry()
	testPanic(
		t,
		func() { registry.RegisterService(NonPointerReply{}) },
		"birpc.RegisterService: method birpc_test.NonPointerReply.NonPointer reply argument must be a pointer type",
	)
}

type NoReturn struct{}

func (NoReturn) NoReturn(args *struct{}, reply *struct{}) {}

func TestRegisterBadNoReturn(t *testing.T) {
	registry := birpc.NewRegistry()
	testPanic(
		t,
		func() { registry.RegisterService(NoReturn{}) },
		"birpc.RegisterService: method birpc_test.NoReturn.NoReturn must return error",
	)
}

type NonErrorReturn struct{}

func (NonErrorReturn) NonErrorReturn(args *struct{}, reply *struct{}) int { return 42 }

func TestRegisterBadNonErrorReturn(t *testing.T) {
	registry := birpc.NewRegistry()
	testPanic(
		t,
		func() { registry.RegisterService(NonErrorReturn{}) },
		"birpc.RegisterService: method birpc_test.NonErrorReturn.NonErrorReturn must return error",
	)
}

type MultiReturn struct{}

func (MultiReturn) MultiReturn(args *struct{}, reply *struct{}) (int, error) { return 42, nil }

func TestRegisterBadMultiReturn(t *testing.T) {
	registry := birpc.NewRegistry()
	testPanic(
		t,
		func() { registry.RegisterService(MultiReturn{}) },
		"birpc.RegisterService: method birpc_test.MultiReturn.MultiReturn must return error",
	)
}

type NonPointerRequest struct{}

func (NonPointerRequest) NonPointer(args int, reply *int) error {
	*reply = args
	return nil
}

func TestNonPointerRequest(t *testing.T) {
	c, s := net.Pipe()
	defer c.Close()
	registry := birpc.NewRegistry()
	registry.RegisterService(NonPointerRequest{})
	server := birpc.NewEndpoint(jsonmsg.NewCodec(s), registry)
	server_err := make(chan error)
	go func() {
		server_err <- server.Serve()
	}()

	io.WriteString(c, `{"id": "42", "fn": "NonPointerRequest.NonPointer", "args": 13}`+"\n")

	var reply LowLevelReply
	dec := json.NewDecoder(c)
	if err := dec.Decode(&reply); err != nil && err != io.EOF {
		t.Fatalf("decode failed: %s", err)
	}
	t.Logf("reply msg: %#v", reply)
	if reply.Error != nil {
		t.Fatalf("unexpected error response: %v", reply.Error)
	}
	if string(reply.Result) != `13` {
		t.Fatalf("got wrong answer: %v", reply.Result)
	}

	c.Close()

	err := <-server_err
	if err != io.EOF {
		t.Fatalf("unexpected error from ServeCodec: %v", err)
	}
}
