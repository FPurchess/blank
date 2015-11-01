// Package birpc provides access to the exported methods of an object
// across a network or other I/O connection. It considers the client
// and server peers, allowing each to call methods on the other.
//
// Any transport can be used, by providing a suitable Codec.
// Codecs are provided for:
//
//   - wetsock: JSON over WebSocket (over HTTP(S))
//   - jsonmsg: JSON over any io.ReadWriteCloser (for example, a TCP connection)
//
// This package was inspired by net/rpc, but is intended for more
// interactive applications. In particular, the wetsock transport,
// combined with some Javascript, makes creating interactive web
// applications easy. See examples/chat for a concrete example.
//
// The RPC methods registered may take extra arguments, in addition
// to the usual request and response. These will be filled by birpc
// and the codec (see FillArgser), when possible. The following are
// some of the types that will be filled:
//
//   - *birpc.Endpoint: the Endpoint this method call was received on
//   - *websocket.Conn (as in github.com/gorilla/websocket): the
//     WebSocket this method call was received on (when using wetsock)
//
// The types Error, Message and FillArgser are only needed if you're
// implementing a new Codec.
package birpc
