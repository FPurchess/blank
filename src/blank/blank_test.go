package blank_test

import (
	"testing"

	"blank"

	"github.com/facebookgo/ensure"
)

func TestNewBlank(t *testing.T) {
	b, err := blank.NewBlank("", false, "")
	ensure.NotNil(t, b)
	ensure.Nil(t, err)
}