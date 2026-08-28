import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DialogProvider } from "./DialogProvider";
import "./index.css";
import "./auth-users.css";
import "./health-permissions.css";
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
      const currentBundle = document.querySelector<HTMLScriptElement>(
        'script[type="module"][src*="/assets/index-"]',
      )?.src;
      const checkForUpdate = () => {
        void registration
          .update()
          .then(() => {
            if (registration.waiting) announceUpdate();
          })
          .catch(() => {});

        if (!navigator.onLine || document.visibilityState === "hidden") return;
        void fetch(`/?molde-cloud-update-check=${Date.now()}`, {
          cache: "no-store",
        })
          .then((response) => response.text())
          .then((html) => {
            const nextDocument = new DOMParser().parseFromString(
              html,
              "text/html",
            );
            const nextBundle = nextDocument
              .querySelector<HTMLScriptElement>(
                'script[type="module"][src*="/assets/index-"]',
              )
              ?.getAttribute("src");
            if (
              currentBundle &&
              nextBundle &&
              new URL(nextBundle, window.location.origin).href !== currentBundle
            )
              announceUpdate();
          })
          .catch(() => {});
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

      const checkWhenVisible = () => {
        if (document.visibilityState === "visible") checkForUpdate();
      };
      window.addEventListener("focus", checkForUpdate);
      window.addEventListener("online", checkForUpdate);
      document.addEventListener("visibilitychange", checkWhenVisible);
      window.setInterval(checkForUpdate, 5 * 60 * 1000);
      checkForUpdate();
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem("molde-cloud:pwa-reload") !== "pending") return;
    sessionStorage.removeItem("molde-cloud:pwa-reload");
    sessionStorage.removeItem("molde-cloud:update-ready");
    window.location.reload();
  });
}
