package blank_test

import (
	"strings"
	"testing"

	"blank"

	"github.com/facebookgo/ensure"
)

func TestNewBlank(t *testing.T) {
	b, err := blank.NewBlank("", false, strings.NewReader(""))
	ensure.NotNil(t, b)
	ensure.Nil(t, err)
}