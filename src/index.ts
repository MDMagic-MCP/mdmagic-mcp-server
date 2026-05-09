#!/usr/bin/env node

// Main MCP server entry point - supports both stdio and HTTP transports
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AuthManager } from './services/authManager.js';
import { MDMagicApiClient } from './services/apiClient.js';
import { registerAllTools } from './tools/index.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Tool definitions shared between both transports
function getToolDefinitions() {
  return [
    {
      name: "convert_document",
      description: "Convert markdown to a professionally formatted document using an MDMagic template.\n\nIMPORTANT GUIDANCE FOR USAGE:\n\n1. Output format meaning:\n   - 'docx' returns a single Word document (.docx)\n   - 'pdf' returns a single PDF (.pdf)\n   - 'html' returns a single HTML file (.html)\n   - 'all' returns a ZIP containing DOCX + PDF + HTML\n\n2. If the user is ambiguous (e.g. 'convert this'), ask them which format they want before calling this tool.\n\n3. If the user attached a file (e.g. 'mydoc.md'), pass its base name (without extension) as the fileName parameter so the output download has a meaningful name. Otherwise the API will derive a name from the markdown's first H1 heading. Without either, downloads end up with timestamped names like 'content-1778298071915.docx' which is bad UX.\n\n4. If you get a 'template not found' error, call list_all_templates first, show the user the available options, and let them pick a real one. Do NOT fall back to generating documents yourself with code execution — that produces inferior results that don't use the user's actual MDMagic templates.\n\n5. Available page sizes are A3, A4, Executive, US_Legal, US_Letter. Default A4 if not specified.",
      inputSchema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "Raw markdown text content (alternative to filePath or fileContent)"
          },
          filePath: {
            type: "string",
            description: "Path to markdown file (VS Code integration, alternative to content or fileContent)"
          },
          fileContent: {
            type: "string",
            description: "Base64 encoded file content (alternative to content or filePath)"
          },
          fileName: {
            type: "string",
            description: "Optional desired base name for the output file (without extension). If the user attached a file like 'mydoc.md', pass 'mydoc' here. The API will use this for the download filename. If omitted, the API derives one from the markdown's first H1 heading."
          },
          templateName: {
            type: "string",
            description: "Template to use for conversion. Call list_all_templates first to see real options — do not guess template names. Some templates are built-in (e.g. 'Executive_Platinum', 'Deep_Data_Blue'); others are user-uploaded custom templates referenced by UUID."
          },
          outputFormat: {
            type: "string",
            enum: ["docx", "pdf", "html", "all"],
            description: "Output format. 'docx', 'pdf', or 'html' return that single file; 'all' returns a ZIP with DOCX+PDF+HTML."
          },
          pageSize: {
            type: "string",
            enum: ["A3", "A4", "Executive", "US_Legal", "US_Letter"],
            description: "Page size for the document (default: A4)"
          },
          orientation: {
            type: "string",
            enum: ["Portrait", "Landscape"],
            description: "Page orientation (default: Portrait)"
          }
        },
        required: ["templateName", "outputFormat"]
      }
    },
    {
      name: "list_all_templates",
      description: "List all available templates (both built-in and custom) for document conversion",
      inputSchema: {
        type: "object" as const,
        properties: {
          includeDetails: {
            type: "boolean",
            description: "Include template details like available page sizes and orientations (default: false)"
          }
        }
      }
    },
    {
      name: "list_builtin_templates",
      description: "List only built-in templates provided by MDMagic",
      inputSchema: {
        type: "object" as const,
        properties: {
          includeDetails: {
            type: "boolean",
            description: "Include template details like available page sizes and orientations (default: false)"
          }
        }
      }
    },
    {
      name: "list_custom_templates",
      description: "List only custom user-uploaded templates",
      inputSchema: {
        type: "object" as const,
        properties: {
          includeDetails: {
            type: "boolean",
            description: "Include template details like available page sizes and orientations (default: false)"
          }
        }
      }
    },
    {
      name: "show_default_settings",
      description: "Show user's default paper size and orientation settings",
      inputSchema: {
        type: "object" as const,
        properties: {}
      }
    },
    {
      name: "check_credit_balance",
      description: "Check your current credit balance across subscription and purchased credits",
      inputSchema: {
        type: "object" as const,
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: "estimate_conversion_cost",
      description: "Estimate credit cost for a conversion without performing it. Shows word count, page calculation, and detailed credit breakdown.",
      inputSchema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "Markdown content to estimate credit cost for"
          },
          templateName: {
            type: "string",
            description: "Template ID or name (UUID for custom templates, name for system templates)"
          },
          outputFormat: {
            type: "string",
            enum: ["docx", "pdf", "html", "all", "all-formats"],
            description: "Output format(s): docx (DOCX only), pdf (DOCX+PDF), html (DOCX+HTML), all/all-formats (DOCX+PDF+HTML)"
          },
          pageSize: {
            type: "string",
            enum: ["A3", "A4", "Executive", "US_Legal", "US_Letter"],
            description: "Page size for the document"
          },
          orientation: {
            type: "string",
            enum: ["Portrait", "Landscape"],
            description: "Page orientation"
          }
        },
        required: ["content", "templateName", "outputFormat"]
      }
    }
  ];
}

function createServer(): Server {
  return new Server(
    {
      name: 'mdmagic-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
}

function registerToolsList(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getToolDefinitions() };
  });
}

// ─── Stdio Transport (local) ────────────────────────────────────────────────

async function startStdio() {
  console.error('Starting MDMagic MCP Server (stdio transport)...');

  const authManager = new AuthManager();
  const apiClient = new MDMagicApiClient(authManager);

  const connectionTest = await apiClient.testConnection();
  if (!connectionTest) {
    throw new Error('Failed to connect to MDMagic API. Please check your configuration.');
  }
  console.error('API connection successful');

  const server = createServer();
  registerToolsList(server);
  await registerAllTools(server, apiClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`MDMagic MCP Server running (stdio)
Connected to: ${apiClient.getBaseUrl()}
Auth: ${authManager.getConfig().apiKey.substring(0, 15)}...`);
}

// ─── HTTP Transport (remote) ────────────────────────────────────────────────

async function startHttp() {
  const port = parseInt(process.env.MCP_HTTP_PORT || '3001');
  const host = process.env.MCP_HTTP_HOST || '127.0.0.1';

  console.error(`Starting MDMagic MCP Server (HTTP transport on ${host}:${port})...`);

  // For HTTP mode, auth comes per-request via x-api-key header.
  // We create ApiClient instances per-session keyed by API key.
  const app = express();
  app.use(express.json());

  // Session management: map session ID → { transport, server }
  const sessions = new Map<string, {
    transport: StreamableHTTPServerTransport;
    server: Server;
    apiClient: MDMagicApiClient;
  }>();

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'streamable-http', sessions: sessions.size });
  });

  // MCP endpoint — handles POST (messages), GET (SSE stream), DELETE (session close)
  app.all('/mcp', async (req, res) => {
    // Extract API key from request headers
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      res.status(401).json({ error: 'x-api-key header is required' });
      return;
    }

    // Validate API key format
    if (!apiKey.match(/^mdmagic-\d{16}$/)) {
      res.status(401).json({ error: 'Invalid API key format. Expected: mdmagic-xxxxxxxxxxxxxxxx' });
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session — route to its transport
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId && !sessions.has(sessionId)) {
      // Invalid session ID
      res.status(404).json({ error: 'Session not found. Please initialize a new session.' });
      return;
    }

    // New session — create auth manager, api client, server, and transport
    try {
      // Set API key in env temporarily for AuthManager
      const authManager = new AuthManager(apiKey);
      const apiClient = new MDMagicApiClient(authManager);

      // Validate connection with the provided API key
      const connectionTest = await apiClient.testConnection();
      if (!connectionTest) {
        res.status(502).json({ error: 'Failed to connect to MDMagic API backend' });
        return;
      }

      const server = createServer();
      registerToolsList(server);
      await registerAllTools(server, apiClient);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { transport, server, apiClient });
          console.error(`[HTTP] New session: ${newSessionId}`);
        }
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && sessions.has(sid)) {
          sessions.delete(sid);
          console.error(`[HTTP] Session closed: ${sid}`);
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      console.error('[HTTP] Session initialization error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: `Server initialization failed: ${error.message}` });
      }
    }
  });

  // Session cleanup on DELETE
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.close();
      sessions.delete(sessionId);
      res.status(200).json({ status: 'session closed' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  app.listen(port, host, () => {
    console.error(`MDMagic MCP Server running (HTTP)
Endpoint: http://${host}:${port}/mcp
Health: http://${host}:${port}/health`);
  });
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────

async function main() {
  const transport = process.env.MCP_TRANSPORT || 'stdio';

  try {
    if (transport === 'http') {
      await startHttp();
    } else {
      await startStdio();
    }
  } catch (error: any) {
    console.error(`MDMagic MCP Server failed to start: ${error.message}`);

    if (error.code === 'MISSING_API_KEY' || error.code === 'INVALID_API_KEY_FORMAT') {
      console.error(`
Setup Guide:
1. Get your API key from your MDMagic dashboard
2. Set environment variable: export MDMAGIC_API_KEY="mdmagic-xxxxxxxxxxxxxxxx"
3. Restart the MCP server`);
    }

    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('Shutting down MDMagic MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down MDMagic MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
