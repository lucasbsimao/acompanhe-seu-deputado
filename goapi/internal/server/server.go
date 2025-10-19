package server

import (
	"context"
	"net"
	"net/http"
	"time"
)

type Server struct {
	http *http.Server
}

func New(handler http.Handler) *Server {
	return &Server{
		http: &http.Server{
			Handler:      handler,
			ReadTimeout:  5 * time.Second,
			WriteTimeout: 5 * time.Second,
			IdleTimeout:  30 * time.Second,
		},
	}
}

func (s *Server) Listen(loopback bool, port string) (net.Listener, error) {
	host := ""
	if loopback {
		host = "127.0.0.1"
	}
	if port == "" {
		port = "0"
	}
	return net.Listen("tcp4", net.JoinHostPort(host, port))
}

func (s *Server) Serve(ln net.Listener) error { return s.http.Serve(ln) }

func (s *Server) Shutdown(ctx context.Context) error { return s.http.Shutdown(ctx) }
