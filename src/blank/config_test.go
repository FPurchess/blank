package blank

import (
	"strings"
	"testing"

	"github.com/facebookgo/ensure"
)

func TestNewConfig(t *testing.T) {
	var err error

	// CASE 1: unmarshalling err
	_, err = newConfig(strings.NewReader("?????"))
	ensure.NotNil(t, err)

	// CASE 2: success!
	_, err = newConfig(strings.NewReader(""))
	ensure.Nil(t, err)
}
