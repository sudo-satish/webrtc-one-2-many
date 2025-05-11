import logo from './logo.svg';
import './App.css';
import WebRTCStreamer from './components/WebRTCStreamer';
import { BrowserRouter } from "react-router";

function App() {
  return (
    <div className="App">
     <div>
      <h1>Live WebRTC Streaming</h1>
      <WebRTCStreamer role="broadcaster" />
      {/* To view as viewer on a separate tab/device: */}
      {/* <WebRTCStreamer role="viewer" /> */}
    </div>
    </div>
  );
}

export default App;
