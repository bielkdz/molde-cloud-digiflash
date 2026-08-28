import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DialogProvider } from "./DialogProvider";
import "./index.css";
import "./auth-users.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      const announceUpdate = () => {
        sessionStorage.setItem("molde-cloud:update-ready", "yes");
        window.dispatchEvent(new Event("molde-cloud:update-ready"));
      };
      if (registration.waiting) announceUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            announceUpdate();
        });
      });
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem("molde-cloud:pwa-reload") !== "pending") return;
    sessionStorage.removeItem("molde-cloud:pwa-reload");
    sessionStorage.removeItem("molde-cloud:update-ready");
    window.location.reload();
  });
}
