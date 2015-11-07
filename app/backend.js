import PubSub from "pubsub-js"

function execute(topic, data) {
  console.log("sending command: ", {topic: topic, data: data || {}})
  PubSub.publish("sendCommand", {topic: topic, data: data || {}})
}

export default execute
