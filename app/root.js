import "babel-polyfill"
import React from "react";
import ReactDOM from "react-dom"
import PubSub from "pubsub-js"

import Editor from "./components/Editor";


THRUST.remote.listen(function (event) {
  var command = JSON.parse(event.payload)

  if (command.hasOwnProperty("topic")) {
    PubSub.publish(command.topic, command.data || {})
  }
})

PubSub.subscribe("sendCommand", function(topic, payload) {
  THRUST.remote.send(JSON.stringify(payload))
})

ReactDOM.render(<Editor keymap={CONFIG.Keymap.editor} />, document.getElementById("root"))
