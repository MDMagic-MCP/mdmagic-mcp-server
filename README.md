# MDMagic MCP Server

> Convert Markdown to professional DOCX, PDF, and HTML — directly from Claude, Cursor, VS Code, or any MCP-compatible AI assistant.

[![npm version](https://img.shields.io/npm/v/@mdmagic/mcp-server.svg)](https://www.npmjs.com/package/@mdmagic/mcp-server)
[![license](https://img.shields.io/npm/l/@mdmagic/mcp-server.svg)](LICENSE)

Your AI assistant writes great Markdown. Exporting it has always been the bottleneck. This MCP server gives Claude (and any other MCP-compatible client) direct access to MDMagic's professional document conversion pipeline — Pandoc + Microsoft Graph API + 15 designer-built templates — so the AI can produce boardroom-grade documents in a single tool call.

```
You: "Take this report and turn it into a Corporate_Navy PDF."

Claude: ✅ Done. Here's your secure download link.
        14-page PDF, 2.3 MB, expires in 60 minutes.
```

## Install

You need an MDMagic account (free tier available) and your API key from your [account page](https://mdmagic.ai/account).

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mdmagic": {
      "command": "npx",
      "args": ["-y", "@mdmagic/mcp-server"],
      "env": {
        "MDMAGIC_API_KEY": "mdmagic-xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Config file location:
- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux** — `~/.config/Claude/claude_desktop_config.json`

Restart Claude Desktop. The MDMagic tools will appear in the tool list.

### Cursor

Add to `~/.cursor/mcp.json` (or via Settings → MCP):

```json
{
  "mcpServers": {
    "mdmagic": {
      "command": "npx",
      "args": ["-y", "@mdmagic/mcp-server"],
      "env": {
        "MDMAGIC_API_KEY": "mdmagic-xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### VS Code (with an MCP extension)

```json
{
  "mcp.servers": {
    "mdmagic": {
      "command": "npx",
      "args": ["-y", "@mdmagic/mcp-server"],
      "env": {
        "MDMAGIC_API_KEY": "mdmagic-xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Hosted (no install)

Don't want Node on the user's machine? Use the hosted endpoint:

```json
{
  "mcpServers": {
    "mdmagic": {
      "url": "https://api.mdmagic.ai/mcp",
      "headers": {
        "x-api-key": "mdmagic-xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Same tools, same templates, served over Streamable HTTP. Useful for clients that don't run local processes.

## What you can do

Once connected, ask your AI assistant things like:

- *"Convert this markdown to a PDF using the Academic_Grey template."*
- *"What templates do I have available?"*
- *"How many credits will it cost to render this 800-word report as DOCX + PDF?"*
- *"Render this in landscape, US Letter, with the Corporate_Navy template."*
- *"Check my credit balance."*

The AI picks the right tool and returns a secure, time-limited download link.

## Tools

| Tool | What it does |
|---|---|
| `convert_document` | Convert Markdown → DOCX / PDF / HTML / all three. Returns a secure expiring URL. |
| `estimate_conversion_cost` | Pre-flight cost estimate based on word count, page count, format, and template type. |
| `check_credit_balance` | Current credit balance (subscription + purchased pools), plan status. |
| `list_all_templates` | Full template catalog: 15 built-in families + your custom uploads. |
| `list_builtin_templates` | Only the built-in templates (Academic, Corporate, Modern, etc.). |
| `list_custom_templates` | Only your custom uploaded templates. |
| `show_default_settings` | Your default page size, orientation, and template preferences. |

### `convert_document` — input options

Three ways to provide the source:

- `content` — raw markdown string (most common)
- `filePath` — absolute path to a `.md` file (great for IDE workflows)
- `fileContent` — base64-encoded markdown (for binary-safe transports)

Plus:

- `templateName` — e.g. `Academic_Grey`, `Corporate_Navy`, or a custom template UUID
- `outputFormat` — `docx`, `pdf`, `html`, `all`, or `all-formats`
- `pageSize` — `A4`, `A3`, `US_Letter`, `US_Legal`, `Executive`
- `orientation` — `Portrait` or `Landscape`

## Config

| Variable | Default | Notes |
|---|---|---|
| `MDMAGIC_API_KEY` | *(required)* | Your personal API key from [mdmagic.ai/account](https://mdmagic.ai/account) |
| `MDMAGIC_BASE_URL` | `https://api.mdmagic.ai` | Override only for local dev or staging |
| `REQUEST_TIMEOUT` | `30000` | Request timeout in ms |
| `MCP_TRANSPORT` | `stdio` | `stdio` (default) or `http` for self-hosted Streamable HTTP |
| `MCP_HTTP_PORT` | `3001` | Port for HTTP transport mode |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address for HTTP transport mode |

Most users will only ever set `MDMAGIC_API_KEY`.

## Pricing

Conversions cost credits, calculated from page count and output format:

- **DOCX**: 1 credit per page (base)
- **PDF**: +1 credit per page
- **HTML**: +1 credit per page
- **Custom templates**: +1 credit per page

A 5-page report converted to DOCX + PDF + HTML using a custom template = `5 × (1 + 1 + 1 + 1) = 20 credits`.

The `estimate_conversion_cost` tool returns exact numbers before you spend anything. The MCP also refuses to run if your balance is too low — no surprise bills.

Free-tier credits renew monthly. Paid plans and credit top-ups available at [mdmagic.ai](https://mdmagic.ai).

## Privacy

- **No permanent storage.** Documents pass through Microsoft Graph API for PDF rendering and are deleted within 5–10 seconds. Output files are deleted from MDMagic servers after download or after 60 minutes, whichever comes first.
- **Random filenames.** Source files use UUIDs, never user-identifiable names.
- **Secure download URLs.** Each conversion returns a one-time URL with session ID and download token. No public file directories.
- **API key isolation.** Each user authenticates with their own key. No shared credentials.

## Troubleshooting

**`MDMAGIC_API_KEY environment variable is required`**
Set the env var in your client config (the `env` block in the JSON). Don't put it in a shell — `npx` won't see it.

**`Invalid API key format`**
Keys must match `mdmagic-` followed by exactly 16 digits. Copy it cleanly from your account page.

**`Failed to connect to MDMagic API`**
Check `https://api.mdmagic.ai/health` in a browser. If it's up, the issue is local network or firewall. Confirm `MDMAGIC_BASE_URL` (default `https://api.mdmagic.ai`) is reachable from the machine running the MCP.

**Tools don't appear in Claude Desktop**
Fully quit and relaunch Claude Desktop after editing `claude_desktop_config.json` — a window close isn't enough.

**`Insufficient credits`**
Use `check_credit_balance` to confirm balance, `estimate_conversion_cost` to preview costs, or top up at [mdmagic.ai/account](https://mdmagic.ai/account).

## Local development

```bash
git clone https://github.com/MDMagic-MCP/mdmagic-mcp-server.git
cd mdmagic-mcp-server
npm install

# Set your API key (use http://localhost:3000 if running the API locally)
cp .env.example .env
# edit .env

# Build and inspect
npm run build
npm run inspector
```

The MCP Inspector (`npm run inspector`) launches a web UI for poking the server tool-by-tool — useful when adding new tools or debugging argument validation.

Run tests with `npm test`.

## Links

- **MDMagic** — [mdmagic.ai](https://mdmagic.ai)
- **Get an API key** — [mdmagic.ai/account](https://mdmagic.ai/account)
- **Issues** — [github.com/MDMagic-MCP/mdmagic-mcp-server/issues](https://github.com/MDMagic-MCP/mdmagic-mcp-server/issues)
- **MCP spec** — [modelcontextprotocol.io](https://modelcontextprotocol.io)

## License

MIT — see [LICENSE](LICENSE).
