/** Streams a single MediaRecorder turn through the authenticated app WebSocket. */
export function liveTranscription(ticketId: string, onPartial: (text: string) => void) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${proto}://${location.host}/api/commerce/ws?voiceTicket=${encodeURIComponent(ticketId)}`);
  const closed = new Promise<void>(resolve => socket.addEventListener("close", () => resolve(), { once: true }));
  let readyResolve: () => void, readyReject: (e: Error) => void;
  let finalResolve: (text: string) => void, finalReject: (e: Error) => void;
  let settled = false, isReady = false, failure: Error | undefined;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const final = new Promise<string>((resolve, reject) => { finalResolve = resolve; finalReject = reject; });
  // Handlers are installed immediately; awaiting is deferred until recording stops.
  void ready.catch(() => undefined); void final.catch(() => undefined);
  const fail = (message: string) => {
    if (settled) return;
    settled = true; failure = new Error(message);
    readyReject(failure); finalReject(failure); socket.close();
  };
  const timeout = window.setTimeout(() => fail("Live transcription took too long to connect. Please resume."), 12000);
  socket.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "voice_ready") { isReady = true; clearTimeout(timeout); readyResolve(); }
      if (data.type === "voice_partial") onPartial(String(data.text));
      if (data.type === "voice_final") { settled = true; clearTimeout(timeout); finalResolve(String(data.text)); }
      if (data.type === "voice_error") fail(String(data.text));
    } catch { fail("The live transcription response was invalid."); }
  };
  socket.onerror = () => fail("The live microphone connection failed. Resume or continue by text.");
  socket.onclose = () => { clearTimeout(timeout); if (!settled) fail("The live microphone connection closed. Resume or continue by text."); };
  return {
    ready,
    send: (data: Blob) => {
      if (failure) return;
      if (isReady && socket.readyState === WebSocket.OPEN) {
        if (socket.bufferedAmount > 500000) fail("Your connection cannot keep up with live audio. Resume when the connection improves.");
        else socket.send(data);
      }
    },
    finish: async () => {
      if (failure) throw failure;
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "finish" }));
      const timer = setTimeout(() => fail("Speech finalization timed out. Resume or use text."), 6000);
      try { return await final; } finally { clearTimeout(timer); socket.close(); }
    },
    cancel: async () => {
      settled = true; clearTimeout(timeout); readyResolve?.(); finalResolve?.(""); socket.close();
      // A new turn must not race the server's per-session stream cleanup.
      if (socket.readyState !== WebSocket.CLOSED) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([closed, new Promise<void>(resolve => { timer = setTimeout(resolve, 2000); })]);
        clearTimeout(timer);
      }
    },
  };
}
