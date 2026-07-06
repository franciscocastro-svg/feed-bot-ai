const DEFAULT_META_PIXEL_ID = "802276099545966";
const META_PIXEL_SCRIPT_ID = "fluxifeed-meta-pixel";

type MetaPixelFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  loaded?: boolean;
  push?: MetaPixelFn;
  queue?: unknown[];
  version?: string;
};

declare global {
  interface Window {
    _fbq?: MetaPixelFn;
    fbq?: MetaPixelFn;
  }
}

const getMetaPixelId = () => {
  const configured = import.meta.env.VITE_META_PIXEL_ID;
  return typeof configured === "string" && configured.trim() ? configured.trim() : DEFAULT_META_PIXEL_ID;
};

let initializedPixelId: string | null = null;

function createFbq() {
  if (window.fbq) return window.fbq;

  const fbq = function metaPixelQueue(...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
      return;
    }
    fbq.queue?.push(args);
  } as MetaPixelFn;

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  window.fbq = fbq;
  window._fbq = fbq;

  return fbq;
}

export function initMetaPixel() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const pixelId = getMetaPixelId();
  if (!pixelId) return;

  const fbq = createFbq();

  if (!document.getElementById(META_PIXEL_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = META_PIXEL_SCRIPT_ID;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript?.parentNode?.insertBefore(script, firstScript);
  }

  if (initializedPixelId !== pixelId) {
    fbq("init", pixelId);
    initializedPixelId = pixelId;
  }
}

export function trackMetaPageView() {
  initMetaPixel();
  window.fbq?.("track", "PageView");
}

export function trackMetaEvent(eventName: string, payload?: Record<string, string | number | boolean>) {
  initMetaPixel();
  window.fbq?.("track", eventName, payload || {});
}
