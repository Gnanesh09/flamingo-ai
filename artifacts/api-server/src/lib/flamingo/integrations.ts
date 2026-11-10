import type { Integration } from "@workspace/api-zod";
import { storage } from "./store";
import { paypalConfigured } from "./paypal";

export function integrations(): Integration[] {
  return [
    { id: "paypal", name: "PayPal Sandbox", configured: paypalConfigured(), status: paypalConfigured() ? "Configured · sandbox only" : "Not connected", description: "Create and send sandbox invoices, verify balances, and send PayPal's standard reminder. Requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET; set your sandbox business email in Business Settings." },
    { id: "groq", name: "Groq", configured: Boolean(process.env.GROQ_API_KEY), status: process.env.GROQ_API_KEY ? "Configured · usage protected" : "Demo rules active", description: "GROQ_API_KEY enables grounded AI investigation. One request at a time, cached analyses, conservative token budgets and cooldowns. No guaranteed free-tier availability." },
    { id: "deepgram", name: "Deepgram", configured: Boolean(process.env.DEEPGRAM_API_KEY), status: process.env.DEEPGRAM_API_KEY ? "Configured · browser voice" : "Not connected", description: "DEEPGRAM_API_KEY enables speech recognition and spoken replies. Microphone audio is sent only during an explicitly started call. Provider credits may be required." },
    { id: "mongodb", name: "MongoDB Atlas", configured: storage === "mongodb", status: storage === "mongodb" ? "Configured · Atlas" : "Local demo storage", description: "MONGODB_URI enables Atlas persistence. Without it, this single-server demo stores data locally; published local files are not durable. A configured database failure never silently switches storage." },
    { id: "langgraph", name: "LangGraph", configured: true, status: "Active", description: "Inspect → reason → validate → prepare approval. The agent has no send or payment mutation tool. Human decisions are persisted separately." },
  ];
}
