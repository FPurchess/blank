import PubSub from "pubsub-js"

function execute(topic, data) {
  PubSub.publish("sendCommand", {topic: topic, data: data || {}})
}

export default execute
