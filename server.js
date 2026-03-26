import express from "express";
import { spawn } from "child_process";

const app = express();
app.use(express.json());

app.get("/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: [{ id: "claude-cli", object: "model", created: 1700000000, owned_by: "anthropic" }],
  });
});

function extractText(content) {
  const raw = Array.isArray(content)
    ? content.map((p) => (typeof p === "string" ? p : p?.text || "")).join("\n")
    : String(content || "");
  const m = raw.match(/\[\w{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\] ([\s\S]+)/);
  return m ? m[1].trim() : raw.trim();
}

function buildPrompt(messages) {
  const parts = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    const text = extractText(msg.content);
    if (!text) continue;
    if (msg.role === "user") parts.push("User: " + text);
    else if (msg.role === "assistant") parts.push("Assistant: " + text);
  }
  return parts.join("\n\n");
}

app.post("/v1/chat/completions", (req, res) => {
  const messages = req.body.messages;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const full = buildPrompt(messages);
  if (!full) return res.status(400).json({ error: "no user message found" });

  const stream = req.body.stream === true;
  const id = "chatcmpl-" + Math.random().toString(36).slice(2);
  const created = Math.floor(Date.now() / 1000);
  const model = req.body.model || "claude-cli";
  console.log(`[chat] stream=${stream} msg=${full.slice(0, 120)}`);

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  const modelFlag = model && model !== "claude-cli" ? `--model ${model} ` : "";
  const proc = spawn("su", ["-c", `claude --print --dangerously-skip-permissions ${modelFlag}${JSON.stringify(full)}`, "claude-user"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOME: "/home/claude-user", USER: "claude-user" },
  });
  let stdout = "", stderr = "";

  proc.stdout.on("data", (d) => {
    stdout += d;
    if (stream) {
      const chunk = { id, object: "chat.completion.chunk", created, model,
        choices: [{ index: 0, delta: { content: d.toString() }, finish_reason: null }] };
      res.write("data: " + JSON.stringify(chunk) + "\n\n");
    }
  });

  proc.stderr.on("data", (d) => { stderr += d; console.error("[stderr]", d.toString().slice(0, 200)); });

  const timer = setTimeout(() => {
    proc.kill();
    console.error("[timeout]");
    if (stream) { res.write("data: [DONE]\n\n"); res.end(); }
    else if (!res.headersSent) res.status(504).json({ error: "timeout" });
  }, 300000);

  proc.on("close", (code) => {
    clearTimeout(timer);
    console.log(`[done] code=${code} len=${stdout.length} err=${stderr.slice(0, 80)}`);
    if (stream) {
      if (!stdout && code !== 0) {
        const e = { id, object: "chat.completion.chunk", created, model,
          choices: [{ index: 0, delta: { content: "[Error: " + stderr.slice(0, 200) + "]" }, finish_reason: null }] };
        res.write("data: " + JSON.stringify(e) + "\n\n");
      }
      const done = { id, object: "chat.completion.chunk", created, model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
      res.write("data: " + JSON.stringify(done) + "\n\n");
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      if (code !== 0 && !res.headersSent) return res.status(500).json({ error: stderr });
      res.json({ id, object: "chat.completion", created, model,
        choices: [{ index: 0, message: { role: "assistant", content: stdout.trim() }, finish_reason: "stop", logprobs: null }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
    }
  });
});

app.listen(3000, () => console.log("claude-proxy listening on :3000"));
