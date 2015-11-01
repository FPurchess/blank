package wetsock_test

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/tv42/birpc"
	"github.com/tv42/birpc/oneshotlisten"
	"github.com/tv42/birpc/wetsock"
)

func MustParseURL(u string) *url.URL {
	uu, err := url.Parse(u)
	if err != nil {
		panic(err)
	}
	return uu
}

type Message struct {
	Greeting string
}

func hello(w http.ResponseWriter, req *http.Request) {
	log.Printf("HELLO")
	upgrader := websocket.Upgrader{}
	ws, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Println(err)
		return
	}
	codec := wetsock.NewCodec(ws)

	msg := birpc.Message{
		ID:   42,
		Func: "Greeting.Greet",
		Args: struct{ Msg string }{"Hello, world"},
	}
	if err := codec.WriteMessage(&msg); err != nil {
		panic(fmt.Sprintf("wetsock send failed: %v", err))
	}
	codec.Close()
}

type nothing struct{}

func TestSend(t *testing.T) {
	// just pipe would deadlock the server and client; we rely on
	// buffered io to be enough to allow them to work
	pipe_client, pipe_server := net.Pipe()

	server := http.Server{
		Handler: http.HandlerFunc(hello),
	}

	fakeListener := oneshotlisten.New(pipe_server)
	done := make(chan error)
	go func() {
		defer close(done)
		done <- server.Serve(fakeListener)
	}()

	ws, _, err := websocket.NewClient(
		pipe_client,
		MustParseURL("http://fakeserver.test/bloop"),
		http.Header{
			"Origin": {"http://fakeserver.test/blarg"},
		},
		4096,
		4096,
	)
	if err != nil {
		t.Fatalf("websocket client failed to start: %v", err)
	}
	var msg birpc.Message
	err = ws.ReadJSON(&msg)
	if err != nil {
		t.Fatalf("websocket client receive error: %v", err)
	}
	if msg.ID != 42 {
		t.Errorf("unexpected seqno: %#v", msg)
	}
	if msg.Func != "Greeting.Greet" {
		t.Errorf("unexpected func: %#v", msg)
	}
	if msg.Args == nil {
		t.Errorf("unexpected args: %#v", msg)
	}
	if msg.Result != nil {
		t.Errorf("unexpected result: %#v", msg)
	}
	if msg.Error != nil {
		t.Errorf("unexpected error: %#v", msg)
	}

	switch greeting := msg.Args.(type) {
	case map[string]interface{}:
		if greeting["Msg"] != "Hello, world" {
			t.Errorf("unexpected greeting: %#v", greeting)
		}

	default:
		t.Fatalf("unexpected args type: %T: %v", msg.Args, msg.Args)
	}

	err = <-done
	if err != nil && err != io.EOF {
		t.Fatalf("http server failed: %v", err)
	}
}

type Address struct {
	Address string
}

type Peer struct{}

func (_ Peer) Address(request *nothing, reply *Address, ws *websocket.Conn) error {
	reply.Address = ws.RemoteAddr().String()
	return nil
}

func TestWSArg(t *testing.T) {
	registry := birpc.NewRegistry()
	registry.RegisterService(Peer{})

	pipe_client, pipe_server := net.Pipe()

	serve := func(w http.ResponseWriter, req *http.Request) {
		upgrader := websocket.Upgrader{}
		ws, err := upgrader.Upgrade(w, req, nil)
		if err != nil {
			log.Println(err)
			return
		}
		endpoint := wetsock.NewEndpoint(registry, ws)
		if err := endpoint.Serve(); err != nil {
			log.Printf("websocket error from %v: %v", ws.RemoteAddr(), err)
		}
	}
	server := http.Server{
		Handler: http.HandlerFunc(serve),
	}

	fakeListener := oneshotlisten.New(pipe_server)
	done := make(chan error)
	go func() {
		defer close(done)
		done <- server.Serve(fakeListener)
	}()

	ws, _, err := websocket.NewClient(
		pipe_client,
		MustParseURL("http://fakeserver.test/bloop"),
		http.Header{
			"Origin": {"http://fakeserver.test/blarg"},
		},
		4096,
		4096,
	)
	request := birpc.Message{
		ID:   13,
		Func: "Peer.Address",
		Args: nothing{},
	}
	err = ws.WriteJSON(&request)
	if err != nil {
		t.Fatalf("websocket send failed: %v", err)
	}

	var msg birpc.Message
	err = ws.ReadJSON(&msg)
	if err != nil {
		t.Fatalf("websocket client receive error: %v", err)
	}
	if msg.ID != 13 {
		t.Errorf("unexpected seqno: %#v", msg)
	}
	if msg.Func != "" {
		t.Errorf("unexpected func: %#v", msg)
	}
	if msg.Args != nil {
		t.Errorf("unexpected args: %#v", msg)
	}
	if msg.Result == nil {
		t.Errorf("unexpected result: %#v", msg)
	}
	if msg.Error != nil {
		t.Errorf("unexpected error: %#v", msg)
	}

	switch result := msg.Result.(type) {
	case map[string]interface{}:
		// this is what net.Pipe gives us
		if result["Address"] != "pipe" {
			t.Errorf("unexpected result: %#v", result)
		}

	default:
		t.Fatalf("unexpected result type: %T: %v", msg.Result, msg.Result)
	}

	err = <-done
	if err != nil && err != io.EOF {
		t.Fatalf("http server failed: %v", err)
	}
}

func helloNoArgs(ws *websocket.Conn) {
	log.Printf("HELLO")
	codec := wetsock.NewCodec(ws)

	msg := birpc.Message{
		ID:   42,
		Func: "Greeting.Greet",
	}
	err := codec.WriteMessage(&msg)
	if err != nil {
		panic(fmt.Sprintf("wetsock send failed: %v", err))
	}
	codec.Close()
}

type Request struct {
	Word string
}

type Reply struct {
	Length int
}

type LowLevelReply struct {
	Id     uint64       `json:"id,string"`
	Result Reply        `json:"result"`
	Error  *birpc.Error `json:"error"`
}

type WordLength struct{}

func (_ WordLength) Len(request *Request, reply *Reply) error {
	reply.Length = len(request.Word)
	return nil
}

const PALINDROME = `{"id": "42", "fn": "WordLength.Len", "args": {"Word": "saippuakauppias"}}` + "\n"

func TestServerNoArgs(t *testing.T) {
	registry := birpc.NewRegistry()
	registry.RegisterService(WordLength{})

	wordlen := func(w http.ResponseWriter, req *http.Request) {
		upgrader := websocket.Upgrader{}
		ws, err := upgrader.Upgrade(w, req, nil)
		if err != nil {
			log.Println(err)
			return
		}
		endpoint := wetsock.NewEndpoint(registry, ws)
		if err := endpoint.Serve(); err != nil && err != io.EOF {
			t.Fatalf("birpc Serve failed: %v", err)
		}
	}

	pipe_client, pipe_server := net.Pipe()

	server := http.Server{
		Handler: http.HandlerFunc(wordlen),
	}

	fakeListener := oneshotlisten.New(pipe_server)
	done := make(chan error)
	go func() {
		defer close(done)
		done <- server.Serve(fakeListener)
	}()

	ws, _, err := websocket.NewClient(
		pipe_client,
		MustParseURL("http://fakeserver.test/bloop"),
		http.Header{
			"Origin": {"http://fakeserver.test/blarg"},
		},
		4096,
		4096,
	)
	if err != nil {
		t.Fatalf("websocket client failed to start: %v", err)
	}

	req := birpc.Message{
		ID:   42,
		Func: "WordLength.Len",
	}
	err = ws.WriteJSON(req)
	if err != nil {
		t.Fatalf("websocket client send error: %v", err)
	}

	var msg birpc.Message
	err = ws.ReadJSON(&msg)
	if err != nil {
		t.Fatalf("websocket client receive error: %v", err)
	}
	if msg.ID != 42 {
		t.Errorf("unexpected seqno: %#v", msg)
	}
	if msg.Func != "" {
		t.Errorf("unexpected func: %#v", msg)
	}
	if msg.Args != nil {
		t.Errorf("unexpected args: %#v", msg)
	}
	if msg.Result == nil {
		t.Errorf("unexpected result: %#v", msg)
	}
	if msg.Error != nil {
		t.Errorf("unexpected error: %#v", msg)
	}

	switch result := msg.Result.(type) {
	case map[string]interface{}:
		if result["Length"] != 0.0 {
			t.Errorf("unexpected result: %#v", result["Length"])
		}

	default:
		t.Fatalf("unexpected result type: %T: %v", msg.Result, msg.Result)
	}

	err = <-done
	if err != nil && err != io.EOF {
		t.Fatalf("http server failed: %v", err)
	}
}
