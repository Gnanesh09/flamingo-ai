// Operational check: uses credentials only to authenticate, never prints them,
// connection strings, provider payloads, or customer records.
import { MongoClient } from "mongodb";
import { createSecureContext } from "node:tls";

function safeMongoFailure(error) {
  const messages = [];
  const codes = [];
  function inspect(value, depth = 0) {
    if (!value || depth > 4) return;
    if (typeof value.message === "string") messages.push(value.message);
    if (typeof value.code === "string" || typeof value.code === "number") codes.push(String(value.code));
    inspect(value.cause, depth + 1);
    if (value.reason?.servers instanceof Map) {
      for (const server of value.reason.servers.values()) inspect(server.error, depth + 1);
    }
  }
  inspect(error);
  const all = messages.join(" ");
  if (codes.includes("ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR")) return "server_rejected_tls_handshake_check_atlas_network_access";
  if (codes.some(code => ["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(code))) return "certificate_verification_failed";
  if (codes.includes("18") || /authentication failed|bad auth/i.test(all)) return "authentication_failed";
  if (/ENOTFOUND|querySrv|ENODATA/.test(all)) return "dns_lookup_failed";
  if (/SSL|TLS|certificate/i.test(all)) return "tls_connection_failed";
  if (/timed out|server selection/i.test(all)) return "connection_timeout_check_atlas_network_access";
  if (/scheme|connection string|URI/i.test(all)) return "invalid_connection_string";
  return "connection_failed";
}

async function checkMongo(tls12 = false) {
  if (!process.env.MONGODB_URI) return { service: "MongoDB", status: "not_configured" };
  let client;
  try {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      // Diagnostic comparison only. Certificate and hostname checks stay enabled.
      ...(tls12 ? { secureContext: createSecureContext({ minVersion: "TLSv1.2", maxVersion: "TLSv1.2" }) } : {}),
    });
    await client.connect();
    await client.db("flamingo_ai").command({ ping: 1 });
    return { service: "MongoDB", status: "connected", tls: tls12 ? "TLSv1.2" : "default" };
  } catch (error) {
    return { service: "MongoDB", status: safeMongoFailure(error), tls: tls12 ? "TLSv1.2" : "default" };
  } finally { await client?.close().catch(() => undefined); }
}

async function checkHttp(service, url, headers, body) {
  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET", headers, ...(body ? { body } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (service === "Groq" && response.ok) {
      const data = await response.json();
      return { service, status: "connected", configuredModelAvailable: data.data?.some(m => m.id === (process.env.GROQ_MODEL || "openai/gpt-oss-20b")) === true };
    }
    return { service, status: response.ok ? "connected" : `http_${response.status}` };
  } catch { return { service, status: "connection_failed" }; }
}

const results = process.argv.includes("--mongo-only")
  ? await Promise.all([checkMongo(), ...(process.argv.includes("--compare-tls") ? [checkMongo(true)] : [])])
  : await Promise.all([
  checkMongo(),
  process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
    ? checkHttp("PayPal Sandbox", "https://api-m.sandbox.paypal.com/v1/oauth2/token", {
        Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      }, "grant_type=client_credentials")
    : { service: "PayPal Sandbox", status: "not_configured" },
  process.env.GROQ_API_KEY
    ? checkHttp("Groq", "https://api.groq.com/openai/v1/models", { Authorization: `Bearer ${process.env.GROQ_API_KEY}` })
    : { service: "Groq", status: "not_configured" },
  process.env.DEEPGRAM_API_KEY
    ? checkHttp("Deepgram", "https://api.deepgram.com/v1/projects", { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` })
    : { service: "Deepgram", status: "not_configured" },
]);
for (const result of results) console.log(JSON.stringify(result));
