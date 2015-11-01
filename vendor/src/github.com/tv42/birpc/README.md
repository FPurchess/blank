Bi-directional RPC library for Go, including JSON-over-WebSocket
================================================================

Go library for RPC where the endpoints are peers that can both call
methods on the other party. This, in combination with the included
`wetsock` library, allows writing interactive web applications that
get live notifications from the server, using JSON over WebSocket.

See a [browser-to-browser chat example](examples/chat) for a quick
overview.

Use the Go import path

    github.com/tv42/birpc

Documentation at http://godoc.org/github.com/tv42/birpc
