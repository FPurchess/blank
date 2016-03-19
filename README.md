
# Blank
Blank is an experimental editor to improve distraction-free writing.

[![Build Status](https://travis-ci.org/FPurchess/blank.png?branch=master)](https://travis-ci.org/FPurchess/blank)

![Blank](https://raw.githubusercontent.com/FPurchess/blank/master/blank-preview.png "Blank - distraction-free writing")

## Installation

```bash
# clone this folder
git clone git@github.com:FPurchess/blank.git
cd blank

# install npm packages
npm install

# install go-bindata (if not already present)
go get -u github.com/jteeuwen/go-bindata/...

# copy config
mkdir -p ~/.blank
cp default.config.yaml ~/.blank/config.yaml
```

## Starting Blank

```bash
./run.sh
```
To start blank in debug mode, execute ```./run.sh --debug=true```. (For a full list of available flags, execute ```./run.sh --help ```)

## Custom Configuration and Keyboard Shortcuts
If not specified otherwise, Blank is looking for a configuration file under ```~/.blank/config,yaml```. Add custom keyboard shortcuts by editing the configuration in this folder or by using the ```--config``` flag.

## Requirements

  - npm
  - go
