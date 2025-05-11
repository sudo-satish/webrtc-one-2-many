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
    broadcasterProducer = await broadcasterTransport.produce({ kind, rtpParameters });
    callback({ id: broadcasterProducer.id });
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
    if (!router.canConsume({ producerId: broadcasterProducer.id, rtpCapabilities })) {
      return callback({ error: "Cannot consume" });
    }

    const transport = consumers[socket.id].transport;
    const consumer = await transport.consume({
      producerId: broadcasterProducer.id,
      rtpCapabilities,
      paused: false,
    });

    consumers[socket.id].consumer = consumer;

    callback({
      id: consumer.id,
      producerId: broadcasterProducer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
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

