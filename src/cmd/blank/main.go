package main

import (
	"blank"
	"log"
)

func main() {
	if err := blank.NewEditor("localhost:3007").Start(); err != nil {
		log.Fatal(err)
	}
}
