// Shared by Expo's build configuration and the mobile runtime. No Node APIs.
/** @param {string | undefined} value */
function publicHttps(value) {
  if (!value || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value))
    throw new Error("Production requires an explicit public HTTPS endpoint.");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const labels = host.split(".");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443") ||
    labels.length < 2 ||
    !labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
    !/^[a-z]{2,63}$/.test(labels[labels.length - 1]) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(
      host,
    ) ||
    /(?:^|\.)(?:example\.(?:com|net|org)|nip\.io|sslip\.io|localtest\.me|lvh\.me)$/.test(
      host,
    )
  )
    throw new Error(
      "Production endpoints must use public HTTPS DNS names, without local addresses or URL credentials.",
    );
  return url;
}
/**
 * Socket.IO accepts an HTTPS origin and negotiates WSS, not a wss:// REST URL.
 * DNS/TLS/reachability still require deployment verification; syntax cannot prove
 * that a public-looking hostname resolves to public infrastructure.
 * @param {string | undefined} apiValue
 * @param {string | undefined} socketValue
 */
function assertProductionEndpoints(apiValue, socketValue) {
  const api = publicHttps(apiValue);
  const socket = publicHttps(socketValue || api.origin);
  if (api.pathname.replace(/\/$/, "") !== "/api/v1" || socket.pathname !== "/")
    throw new Error(
      "Production API must end in /api/v1 and Socket.IO URL must be an origin.",
    );
}
module.exports = { assertProductionEndpoints, publicHttps };
