package provisioner

import "github.com/miketheprogrammer/go-thrust/lib/spawn"

// Default implementation of Provisioner

type DefaultProvisioner struct{}

func NewDefaultProvisioner() DefaultProvisioner {
	return DefaultProvisioner{}
}

func (tp DefaultProvisioner) Provision() error {
	spawn.SetBaseDirectory("") // Means use the users home directory
	return spawn.Bootstrap()
}
