import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackMetaPageView } from "@/lib/metaPixel";

const TRACKED_PUBLIC_PATHS = new Set([
  "/",
  "/auth",
  "/pricing",
  "/terms",
  "/privacy",
  "/data-deletion",
]);

function shouldTrackPath(pathname: string) {
  if (pathname.startsWith("/dashboard")) return false;
  if (pathname.startsWith("/checkout")) return false;
  if (pathname.includes("password")) return false;
  return TRACKED_PUBLIC_PATHS.has(pathname);
}

export function MetaPixelTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!shouldTrackPath(location.pathname)) return;
    trackMetaPageView();
  }, [location.pathname]);

  return null;
}
