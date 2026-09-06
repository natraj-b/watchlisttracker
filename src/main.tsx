import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { completeSignInFromLink, initCloudSync } from "./lib/cloudSync";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Cloud sync is a background concern — kick it off after the first paint so the
// Firebase SDK never sits on the critical path. `completeSignInFromLink` still
// runs early enough to catch a magic-link redirect (it's the same task queue).
const bootSync = () => {
  initCloudSync();
  completeSignInFromLink();
};
if ("requestIdleCallback" in window) {
  requestIdleCallback(bootSync, { timeout: 2000 });
} else {
  setTimeout(bootSync, 1);
}
