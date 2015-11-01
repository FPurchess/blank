# Blank
Blank is an experiment to improve distraction-free writing.

## Requirements

  - npm
  - go

## Installation

```bash
git clone git@github.com:FPurchess/blank.git
cd blank
npm install
```

## Starting Blank

```bash
./run.sh
```
Hint: To start blank in headless mode, execute ```./run.sh false```.

Blank can also be run directly to pass custom flags. A full list is available under
```bash
go run src/cmd/blank/*.go --help
```

## Custom Configuration | Custom Keyboard Shortcuts
If not specified otherwise, Blank is looking for a configuration file under ```~/.blank/config,yaml```. Add custom keyboard shortcuts by copying the default configuration to this folder or via the ```--config``` flag.

```bash
mkdir -p ~/.blank
cp default.config.yaml ~/.blank/config.yaml
```
