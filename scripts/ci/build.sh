#!/usr/bin/env bash

set -ev


WORKDIR="src/"

ASSETS_DEST="src/blank/assets.go"
ASSETS_SRC="public/... tmpl/..."


# prepare assets
webpack
go-bindata -pkg="blank" -o ${ASSETS_DEST} ${ASSETS_SRC}


# lint / vet
golint ${WORKDIR}
go tool vet ${WORKDIR}


if [ "${TRAVIS_PULL_REQUEST}" == "false" ]; then
    cd ${WORKDIR}/blank
    goveralls -repotoken ${COVERALLS_TOKEN} .
else
    cd ${WORKDIR}
    go test blank/
fi