import './App.css';
import WebRTCStreamer from './components/WebRTCStreamer';

function Viewer() {
  return (
    <div className="App">
     <div>
      <h1>Live WebRTC Streaming</h1>
      {/* To view as viewer on a separate tab/device: */}
      <WebRTCStreamer role="viewer" />
    </div>
    </div>
  );
}

export default Viewer;
