const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mediasoup = require("mediasoup");
const config = require("./mediasoupConfig");
const cors = require('cors')

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
      origin: "*", // Allow all origins (for development)
      methods: ["GET", "POST"],
      credentials: false,
    },
    transports: ["polling", "websocket"]
  }
);

app.use(cors())

let worker;
let router;
let broadcasterTransport;
let broadcasterProducer;
let broadcasterProducers = {};
let consumers = {};

(async () => {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({ mediaCodecs: config.mediaCodecs });
})();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("getRtpCapabilities", (callback) => {
    try {
        console.log("🔁 getRtpCapabilities received");
        callback(router.rtpCapabilities);
      } catch (err) {
        console.error("getRtpCapabilities error:", err);
        callback({ error: err.message });
      }
  });

  socket.on("createProducerTransport", async (callback) => {
    console.log('Inside createProducerTransport');
    const transport = await router.createWebRtcTransport(config.webRtcTransport);
    broadcasterTransport = transport;

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });

    transport.on("dtlsstatechange", dtlsState => {
      if (dtlsState === "closed") transport.close();
    });
  });

  socket.on("connectProducerTransport", async ({ dtlsParameters }, callback) => {
    await broadcasterTransport.connect({ dtlsParameters });
    callback();
  });

  socket.on("produce", async ({ kind, rtpParameters }, callback) => {
    const producer = await broadcasterTransport.produce({ kind, rtpParameters });
  
    broadcasterProducers[kind] = producer;
  
    callback({ id: producer.id });
  });
  socket.on("createConsumerTransport", async (callback) => {
    const transport = await router.createWebRtcTransport(config.webRtcTransport);
    consumers[socket.id] = { transport };

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });

    transport.on("dtlsstatechange", dtlsState => {
      if (dtlsState === "closed") transport.close();
    });

    transport.on("close", () => {
      delete consumers[socket.id];
    });
  });

  socket.on("connectConsumerTransport", async ({ dtlsParameters }, callback) => {
    const transport = consumers[socket.id].transport;
    await transport.connect({ dtlsParameters });
    callback();
  });

  socket.on("consume", async ({ rtpCapabilities }, callback) => {
    const consumerParamsList = [];
    const consumerTransport = consumers[socket.id].transport;
  
    for (const kind in broadcasterProducers) {
      const producer = broadcasterProducers[kind];
  
      if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) continue;
  
      const consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: false,
      });
  
      consumerParamsList.push({
        id: consumer.id,
        producerId: producer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
  
      // Optionally store consumer if needed
    }
  
    callback(consumerParamsList); // Return both audio and video
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    if (consumers[socket.id]) {
      consumers[socket.id].transport.close();
      delete consumers[socket.id];
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

