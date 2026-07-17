const SUPPORTED_PROXY_OUTPUTS = new Set(["jpg", "png"]);

export function normalizeWorkerImageOutput(output) {
  return SUPPORTED_PROXY_OUTPUTS.has(output) ? output : "jpg";
}

export function buildWorkerImageProxyUrl(url, { output = "jpg" } = {}) {
  const cleanUrl = String(url || "")
    .replace(/&amp;/gi, "&")
    .replace(/^https?:\/\//, "");
  const safeOutput = normalizeWorkerImageOutput(output);
  return `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&output=${safeOutput}`;
}

export function requireWorkerImage(image, message) {
  if (!image) throw new Error(message);
  return image;
}
