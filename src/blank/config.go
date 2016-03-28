package blank

import (
	"os"
	"io"
	"io/ioutil"
	"strings"
	log "github.com/Sirupsen/logrus"

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

func loadConfig(file string) []byte {
	file = strings.Replace(file, "~", os.Getenv("HOME"), -1)

	conf, err := ioutil.ReadFile(file)
	if err != nil {
		log.WithFields(log.Fields{
			"file": file,
			"error": err,
		}).Warnf("failed to open config file: %v", err)

		return MustAsset("default.config.yaml")
	}

	return conf
}