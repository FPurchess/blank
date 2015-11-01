package blank

import (
	"io"
	"io/ioutil"

	"github.com/go-yaml/yaml"
)

type config struct {
	Keymap map[string]map[string]string `yaml:"keymap"`
}

func newConfig(in io.Reader) (*config, error) {
	buf, err := ioutil.ReadAll(in)
	if err != nil {
		return nil, err
	}

	config := &config{}
	if err := yaml.Unmarshal(buf, config); err != nil {
		return nil, err
	}

	return config, nil
}
