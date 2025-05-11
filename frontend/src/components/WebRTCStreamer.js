// WebRTCStreamer.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import io from "socket.io-client";


function WebRTCStreamer({ role = "broadcaster" }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [device, setDevice] = useState(null);
  const [stream, setStream] = useState(null);

  const socket = useMemo(() => io("http://localhost:3000", {
    transports: ["websocket"],
    withCredentials: false
  }), [])// Update if hosted elsewhere

  useEffect(() => {

    const socket = io("http://localhost:3000", {
      transports: ["websocket"],
      withCredentials: false
    }); // Update if hosted elsewhere

    socket.on("connect", () => {
      console.log("Connected to signaling server");

      if (role === "broadcaster") startBroadcast();
      // else startViewer();
    });

    return () => {
      socket.disconnect();
    };
  }, [role]);

  async function loadDevice(routerRtpCapabilities) {
    const device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities });
    setDevice(device);
    return device;
  }

  async function startBroadcast() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
  
      console.log("🎥 Got stream", stream);
      setStream(stream);
  
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
  
        // Required to trigger autoplay on some browsers
        localVideoRef.current.onloadedmetadata = () => {
          localVideoRef.current.play().catch(err => {
            console.warn("⚠️ Auto-play blocked, playing manually failed:", err);
          });
        };
      }
  
      const rtpCapabilities = await new Promise((resolve) =>
        socket.emit("getRtpCapabilities", resolve)
      );
  
      const device = await loadDevice(rtpCapabilities);
  
      const transportData = await new Promise((resolve) =>
        socket.emit("createProducerTransport", resolve)
      );
  
      const transport = device.createSendTransport(transportData);
  
      transport.on("connect", ({ dtlsParameters }, callback) => {
        socket.emit("connectProducerTransport", { dtlsParameters }, callback);
      });
  
      transport.on("produce", ({ kind, rtpParameters }, callback) => {
        socket.emit("produce", { kind, rtpParameters }, (data) => {
          console.log(data)
          callback(data.id);
        });
      });
  
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
  
      if (videoTrack) {
        await transport.produce({ track: videoTrack });
      } else {
        console.warn("⚠️ No video track found.");
      }
  
      if (audioTrack) {
        await transport.produce({ track: audioTrack });
      }
    } catch (err) {
      console.error("❌ startBroadcast error:", err);
    }
  }
  

  async function startViewer() {
    const rtpCapabilities = await new Promise((resolve) =>
      socket.emit("getRtpCapabilities", resolve)
    );

    const device = await loadDevice(rtpCapabilities);

    const transportData = await new Promise((resolve) =>
      socket.emit("createConsumerTransport", resolve)
    );

    const transport = device.createRecvTransport(transportData);

    transport.on("connect", ({ dtlsParameters }, callback) => {
      socket.emit("connectConsumerTransport", { dtlsParameters }, callback);
    });

    const consumerParameters = await new Promise((resolve) =>
      socket.emit("consume", { rtpCapabilities: device.rtpCapabilities }, resolve)
    );

    console.log(consumerParameters);

    const mediaStream = new MediaStream();

    const consumer = await transport.consume({
      id: consumerParameters.id,
      producerId: consumerParameters.producerId,
      kind: consumerParameters.kind,
      rtpParameters: consumerParameters.rtpParameters,
    });
    mediaStream.addTrack(consumer.track);


    remoteVideoRef.current.srcObject = mediaStream;

    remoteVideoRef.current.srcObject.getTracks().forEach(track => console.log(track.kind));

    remoteVideoRef.current.onloadedmetadata = () => {
      remoteVideoRef.current.play().catch((err) =>
        console.warn("Video play failed:", err)
      );
    };
  }

  return (
    <div>
      <h2>{role === "broadcaster" ? "Broadcaster" : "Viewer"}</h2>
      <button onClick={startViewer}>Play</button>
      <video
        ref={role === "broadcaster" ? localVideoRef : remoteVideoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "80%", border: "2px solid black" }}
      ></video>
    </div>
  );
}

export default WebRTCStreamer;
