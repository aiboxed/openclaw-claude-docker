# OpenClaw + Claude Code in Docker

Run Claude Code as a fully agentic AI inside Docker, accessible through the [OpenClaw](https://openclaw.dev) chat UI. Claude can write files, run commands, install packages, build and start web apps — all sandboxed inside the container.

## How it works

```
Browser (OpenClaw UI)
      │  WebSocket
      ▼
openclaw-gateway
      │  POST /v1/chat/completions
      ▼
claude-proxy  ←  server.js (OpenAI-compatible API)
      │  claude --print --dangerously-skip-permissions
      ▼
claude-user (non-root + passwordless sudo)
      ▼
port-bridge  →  localhost:8181
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — `npm install -g @anthropic-ai/claude-code`
- An Anthropic account

---

## Setup

### 1. Get a long-lived OAuth token

```bash
claude setup-token
```

This gives you a token valid for 1 year (`sk-ant-oat01-...`). Copy it.

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Paste your token into `.env`:

```
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token-here
```

> Never commit `.env` to git.

### 3. Copy the OpenClaw config

**Mac/Linux:**

```bash
mkdir -p ~/.openclaw
cp openclaw.json ~/.openclaw/openclaw.json
```

**Windows (PowerShell):**

```powershell
mkdir "$env:USERPROFILE\.openclaw" -Force
cp "$PWD\openclaw.json" "$env:USERPROFILE\.openclaw\openclaw.json"
```

> Run this from inside the cloned repo folder.

### 4. Start the containers

```bash
docker compose up -d --build
```

| Container          | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `openclaw-gateway` | OpenClaw UI at http://localhost:18789                             |
| `claude-proxy`     | OpenAI-compatible API wrapping Claude CLI                         |
| `port-bridge`      | Forwards host:8181 → container so you can open apps Claude builds |

Check everything is running:

```bash
docker compose ps
```

### 5. Verify

```bash
docker exec claude-proxy su -c "claude --print 'say hi'" claude-user
```

Expected: `Hi! How can I help you today?`

### 6. Connect OpenClaw

1. Open **http://localhost:18789**
2. Get your dashboard token:
   ```bash
   docker exec openclaw-gateway openclaw dashboard --no-open
   ```
3. Open the URL it prints — it auto-fills the token
4. Click **Connect**
5. Approve the device pairing:
   ```bash
   docker exec openclaw-gateway openclaw devices list
   docker exec openclaw-gateway openclaw devices approve <REQUEST-ID>
   ```

---

## Usage

The model dropdown has three options: **Claude Sonnet 4.6** (default), **Claude Opus 4.6**, and **Claude Haiku 4.5**.

**Agentic example:**

```
Build an Express.js app on port 8181 that shows a live crypto price tracker.
Fetch BTC, ETH, and SOL prices from the CoinGecko public API (no key needed).
Show price and 24h % change with green/red colors. Auto-refresh every 30 seconds.
Use inline HTML/CSS. Save as /app/crypto.js and start it with: nohup node /app/crypto.js &
```

Then open **http://localhost:8181**.

---

## Exposing more ports

If Claude starts an app on a different port, add a port-bridge service in `docker-compose.yml`:

```yaml
port-bridge-8282:
  image: alpine/socat
  container_name: port-bridge-8282
  command: TCP-LISTEN:8282,fork,reuseaddr TCP:claude-proxy:8282
  ports:
    - "8282:8282"
  networks:
    - claude-net
  depends_on:
    - claude-proxy
  restart: unless-stopped
```

Then:

```bash
docker compose up -d port-bridge-8282
```

---

## Troubleshooting

| Problem                       | Fix                                                    |
| ----------------------------- | ------------------------------------------------------ |
| `OAuth token has expired`     | Run `claude setup-token` and update `.env`             |
| Auth error on startup         | Check `CLAUDE_CODE_OAUTH_TOKEN` is set in `.env`       |
| App not accessible in browser | Check port-bridge is running: `docker compose ps`      |
| Empty responses               | Check proxy logs: `docker logs claude-proxy --tail 20` |
