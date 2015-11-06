package blank

import (
	"strings"
	"testing"

	"github.com/facebookgo/ensure"
)

func TestNewConfig(t *testing.T) {
	var err error

	// unmarshalling err
	_, err = newConfig(strings.NewReader("?????"))
	ensure.NotNil(t, err)

	// success!
	_, err = newConfig(strings.NewReader(""))
	ensure.Nil(t, err)
}
