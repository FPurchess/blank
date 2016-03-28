#!/usr/bin/env bash

set -ev


# §1 prepare assets
webpack --bail
go-bindata -pkg="blank" -o src/blank/assets.go public/... tmpl/...

# §2 lint / vet / test
golint src/
go tool vet src/
# TODO(fpur) 'gb test' does not support coverage. see https://github.com/constabulary/gb/issues/367
gb test

# §3 build
VERSION=dev
if [ -z "$TRAVIS" ]; then
    VERSION="${TRAVIS_BRANCH}-0.1.${TRAVIS_BUILD_NUMBER}"
fi

# TODO(fpur) 'gb build' does not support the -o option...
GOOS=linux GOARCH=amd64 gb build   && mv $(pwd)/bin//blank-linux-amd64      $(pwd)/bin/blank-linux-amd64-${VERSION}
GOOS=darwin GOARCH=amd64 gb build  && mv $(pwd)/bin/blank-darwin-amd64      $(pwd)/bin/blank-darwin-amd64-${VERSION}
GOOS=windows GOARCH=amd64 gb build && cp $(pwd)/bin/blank-windows-amd64.exe $(pwd)/bin/blank-windows-amd64-${VERSION}.exe