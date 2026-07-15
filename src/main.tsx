import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles.css";

// Daily Money is installed as an app-like, fixed-scale interface on iPhone.
// Keep normal one-finger scrolling, but stop Safari's pinch gesture fallback.
const blockGestureZoom = (event: Event) => event.preventDefault();
const blockPinchZoom = (event: TouchEvent) => {
  if (event.touches.length > 1) event.preventDefault();
};
document.addEventListener("gesturestart", blockGestureZoom, { passive: false });
document.addEventListener("gesturechange", blockGestureZoom, { passive: false });
document.addEventListener("gestureend", blockGestureZoom, { passive: false });
document.addEventListener("touchmove", blockPinchZoom, { passive: false });

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent("daily-money-update-available", { detail: () => updateServiceWorker(true) }));
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>
);
