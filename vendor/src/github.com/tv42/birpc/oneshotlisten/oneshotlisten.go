package oneshotlisten

import (
	"io"
	"net"
)

type OneShotListener struct {
	conn   net.Conn
	fired  bool
	closed bool
}

func New(conn net.Conn) *OneShotListener {
	return &OneShotListener{
		conn: conn,
	}
}

func (l *OneShotListener) Accept() (net.Conn, error) {
	if l.closed || l.fired {
		return nil, io.EOF
	}
	l.fired = true
	return l.conn, nil
}

func (l *OneShotListener) Close() error {
	l.closed = true
	return nil
}

func (l *OneShotListener) Addr() net.Addr {
	return l.conn.LocalAddr()
}
