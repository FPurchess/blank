package blank

import (
	"strings"
	"testing"

	"github.com/facebookgo/ensure"
)

func TestNewBlank(t *testing.T) {
	_, err := NewBlank("", false, strings.NewReader(""), []Plugin{})
	ensure.Nil(t, err)
}
