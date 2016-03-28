package components

import (
	"blank/transport"

	log "github.com/Sirupsen/logrus"
)

type Stoppable interface {
	Stop()
}

type Component interface {
	Setup(Stoppable, *transport.Tunnel)
	Teardown()
}

var components = make(map[string]Component)

// registerComponent registers a `Component`
func registerComponent(name string, component Component) {
	if _, exists := components[name]; exists {
		log.Fatalf("failed to register component: '%s' already exists", name)
	}
}

// Components returns all registered components as a map of name -> `Component`
func Components() map[string]Component {
	return components
}