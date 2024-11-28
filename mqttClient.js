const mqtt = require("mqtt");
const { createTsString } = require("./tsEncoder");

let client;

module.exports = {
  connectMQTT: async (topic) => {
    client = mqtt.connect(process.env.MQTT_BROKER_URL);
    client.on("connect", () => {
      console.log(`Connected to MQTT, subscribing to topic: ${topic}`);
      client.subscribe(topic);
    });
    client.on("message", (topic, message) => {
      console.log(`Received message on ${topic}: ${message.toString()}`);
      // Handle message processing here
    });
  },

  disconnectMQTT: () => {
    if (client) client.end();
    console.log("MQTT disconnected.");
  },
};
