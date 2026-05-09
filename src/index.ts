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
// Reusable schema fragments
const PAGE_SIZE_ENUM = ["A3", "A4", "Executive", "US_Legal", "US_Letter"];
const ORIENTATION_ENUM = ["Portrait", "Landscape"];
const CATEGORY_ENUM = ["Business", "Creative", "Professional", "Technical"];

const TEMPLATE_OBJECT_SCHEMA = {
  type: "object" as const,
  properties: {
    id: { type: "string", description: "Template ID — pass this as templateName to convert_document" },
    name: { type: "string", description: "Human-readable template name" },
    type: { type: "string", enum: ["built-in", "custom"], description: "Source of the template" },
    category: { type: ["string", "null"], description: "Category label (built-in templates only)" },
    description: { type: "string", description: "Short description of the template's intended use" }
  },
  required: ["id", "name", "type"]
};

function getToolDefinitions() {
  return [
    {
      name: "convert_document",
      description: "Convert markdown to a professionally formatted document using an MDMagic template.\n\nIMPORTANT GUIDANCE:\n\n1. Output format → what user gets:\n   - 'docx' → a single Word .docx file\n   - 'pdf' → a single .pdf file\n   - 'html' → a single .html file\n   - 'all' → a ZIP containing all three (DOCX + PDF + HTML)\n\n2. If the user is ambiguous (e.g. 'convert this'), ASK which format they want before calling. Don't assume.\n\n3. Filename: if the user attached a file (e.g. 'mydoc.md'), pass its base name as fileName. Otherwise the API derives one from the markdown's first H1. Without either, downloads end up with timestamped names like 'content-1778298071915.docx' which is bad UX.\n\n4. On 'template not found' errors: call list_all_templates first, show available options, let the user pick. Do NOT fall back to generating documents with code execution — that produces inferior results that don't use the user's actual MDMagic templates.\n\n5. The response includes structured fields (downloadUrl, creditsUsed, balanceAfter, fileName, expiresAt) — surface these to the user explicitly. Don't paraphrase. The user wants to know exactly what they spent and what's left.\n\n6. Page sizes: A3, A4, Executive, US_Legal, US_Letter. Default A4. Orientation: Portrait or Landscape, default Portrait.",
      annotations: {
        title: "Convert markdown to a professional document",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      },
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
            enum: PAGE_SIZE_ENUM,
            description: "Page size for the document (default: A4)"
          },
          orientation: {
            type: "string",
            enum: ORIENTATION_ENUM,
            description: "Page orientation (default: Portrait)"
          }
        },
        required: ["templateName", "outputFormat"]
      },
      outputSchema: {
        type: "object" as const,
        description: "Conversion result with secure download link and credit accounting",
        properties: {
          success: { type: "boolean", description: "Whether the conversion succeeded" },
          downloadUrl: { type: "string", description: "Secure expiring download URL (valid for 60 minutes)" },
          fileName: { type: "string", description: "Filename of the downloadable document" },
          creditsUsed: { type: "number", description: "Credits debited for this conversion" },
          balanceAfter: { type: "number", description: "Remaining credit balance after this conversion" },
          expiresAt: { type: "string", format: "date-time", description: "ISO 8601 timestamp when the download URL expires" },
          message: { type: "string", description: "Human-readable status message" }
        },
        required: ["success", "downloadUrl", "fileName"]
      }
    },
    {
      name: "list_all_templates",
      description: "List all 15 built-in MDMagic templates plus any custom templates the user has uploaded.\n\nCALL THIS PROACTIVELY when:\n- The user mentions a template by name (verify it exists before convert_document)\n- The user asks 'what templates are available' or similar\n- A previous convert_document call returned 'template not found'\n- The user describes the look they want without naming a template (so you can suggest a real one)\n\nReturns: name, description, type (built-in vs custom), and category. Categories are: Business (5 templates), Creative (6), Professional (2), Technical (2). Use the optional category filter to narrow recommendations (e.g. 'for legal documents' → category: 'Professional').",
      annotations: {
        title: "List all MDMagic templates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          includeDetails: {
            type: "boolean",
            description: "Include template details like available page sizes and orientations (default: false)"
          },
          category: {
            type: "string",
            enum: CATEGORY_ENUM,
            description: "Optional filter — return only built-in templates in this category. Custom templates are always included regardless. Categories: Business (executive/financial), Creative (designer/artistic/novelty), Professional (legal), Technical (code/data documentation)."
          }
        }
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          builtinCount: { type: "integer", description: "Number of built-in templates returned" },
          customCount: { type: "integer", description: "Number of custom templates returned" },
          templates: { type: "array", items: TEMPLATE_OBJECT_SCHEMA, description: "All matching templates" }
        },
        required: ["templates"]
      }
    },
    {
      name: "list_builtin_templates",
      description: "List the 15 built-in MDMagic templates, grouped by category. Same as list_all_templates but excludes the user's custom uploads. Use this when the user asks specifically about MDMagic's bundled templates rather than their personal ones.\n\nCategories available: Business (5), Creative (6), Professional (2), Technical (2).",
      annotations: {
        title: "List built-in MDMagic templates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          includeDetails: {
            type: "boolean",
            description: "Include template details like available page sizes and orientations (default: false)"
          },
          category: {
            type: "string",
            enum: CATEGORY_ENUM,
            description: "Optional filter — return only templates in this category."
          }
        }
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          count: { type: "integer", description: "Number of templates returned" },
          templates: { type: "array", items: TEMPLATE_OBJECT_SCHEMA, description: "Matching built-in templates" }
        },
        required: ["templates"]
      }
    },
    {
      name: "list_custom_templates",
      description: "List only the user's custom-uploaded Word templates. Use this when the user asks about their own templates ('show me my templates', 'do I have a letterhead?'). Custom templates are referenced by UUID, not name, when calling convert_document.",
      annotations: {
        title: "List user's custom templates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          includeDetails: {
            type: "boolean",
            description: "Include template details like available page sizes and orientations (default: false)"
          }
        }
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          count: { type: "integer", description: "Number of custom templates returned" },
          templates: { type: "array", items: TEMPLATE_OBJECT_SCHEMA, description: "User's custom templates" }
        },
        required: ["templates"]
      }
    },
    {
      name: "show_default_settings",
      description: "Show the user's default paper size and orientation preferences (set on their account page). Useful when the user hasn't specified pageSize/orientation explicitly — call this to honor their defaults instead of using A4/Portrait blindly.",
      annotations: {
        title: "Show user's default page size and orientation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: {
        type: "object" as const,
        properties: {}
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          default_page_size: { type: "string", description: "User's preferred page size" },
          default_orientation: { type: "string", description: "User's preferred page orientation" }
        },
        required: ["default_page_size", "default_orientation"]
      }
    },
    {
      name: "check_credit_balance",
      description: "Check the user's current MDMagic credit balance: subscription credits (renewable monthly), purchased credits (permanent), plan name, and plan status.\n\nCALL THIS PROACTIVELY when:\n- The user asks 'how many credits do I have' or similar\n- After a conversion, if the user wants to know what's left (also returned by convert_document directly)\n- Before a conversion of an unusually large document, to warn the user if balance is borderline",
      annotations: {
        title: "Check MDMagic credit balance",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: {
        type: "object" as const,
        properties: {},
        additionalProperties: false
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          total_credits: { type: "integer", description: "Total credits available (subscription + purchased)" },
          subscription_credits: { type: "integer", description: "Renewable monthly subscription credits" },
          purchased_credits: { type: "integer", description: "Permanent purchased credits" }
        },
        required: ["total_credits"]
      }
    },
    {
      name: "estimate_conversion_cost",
      description: "Estimate credit cost for a conversion BEFORE running it. Returns word count, page calculation (300 words/page), and a credit breakdown by format and template type. Use this when the user asks 'how much will this cost?' or when you suspect a conversion might exceed their balance — convert_document refuses to run if credits are insufficient, so estimating first is friendlier.",
      annotations: {
        title: "Estimate credit cost for a conversion",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
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
            enum: PAGE_SIZE_ENUM,
            description: "Page size for the document"
          },
          orientation: {
            type: "string",
            enum: ORIENTATION_ENUM,
            description: "Page orientation"
          }
        },
        required: ["content", "templateName", "outputFormat"]
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          wordCount: { type: "integer", description: "Word count of the markdown content" },
          pageCount: { type: "integer", description: "Estimated page count (300 words/page)" },
          totalCredits: { type: "integer", description: "Total credits required for this conversion" },
          breakdown: { type: "string", description: "Human-readable breakdown of how credits are calculated" }
        },
        required: ["totalCredits"]
      }
    },
    {
      name: "validate_markdown",
      description: "Pre-flight markdown validation BEFORE conversion. Catches malformed tables (mismatched pipes), unclosed code fences, broken task lists, and unsupported syntax. Returns a green/amber/red status plus the detected markdown features.\n\nCALL THIS PROACTIVELY when:\n- The user is about to convert a long document (>5 pages) — validating first is cheap; running a doomed conversion costs credits\n- The user reports a previous conversion produced broken output\n- You generated the markdown yourself and want to verify it's clean before spending credits\n\nReturns: status (green=safe, amber=minor issues, red=will likely break), detected features (tables, code blocks, task lists, math), and a human-readable message.",
      annotations: {
        title: "Validate markdown before conversion",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "Markdown content to validate"
          },
          filename: {
            type: "string",
            description: "Optional filename label for the response (defaults to 'content.md')"
          }
        },
        required: ["content"]
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          filename: { type: "string", description: "Filename label echoed back" },
          status: { type: "string", enum: ["green", "amber", "red"], description: "Validation verdict" },
          message: { type: "string", description: "Human-readable explanation of any issues" },
          inputFormat: { type: ["string", "null"], description: "Detected markdown flavour (e.g. gfm, commonmark)" },
          additionalPandocFlags: { type: "array", items: { type: "string" }, description: "Pandoc flags that will be applied" },
          detectedFeatures: { type: "object", description: "Map of markdown features found in the content" }
        },
        required: ["status", "message"]
      }
    },
    {
      name: "get_template_details",
      description: "Show available variants (page sizes and orientations) for a specific template. All MDMagic templates support the full 5×2 matrix: A3, A4, Executive, US_Legal, US_Letter × Portrait/Landscape. Use this when the user asks 'does this template come in Legal Landscape?' or 'what sizes are available?' — confirms the variant before convert_document runs.",
      annotations: {
        title: "Show template variant matrix",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          templateName: {
            type: "string",
            description: "Template ID or name (e.g. Executive_Platinum, or a UUID for custom templates)"
          }
        },
        required: ["templateName"]
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          template: TEMPLATE_OBJECT_SCHEMA,
          pageSizes: { type: "array", items: { type: "string" }, description: "Supported page sizes" },
          orientations: { type: "array", items: { type: "string" }, description: "Supported orientations" }
        },
        required: ["template", "pageSizes", "orientations"]
      }
    },
    {
      name: "recommend_template",
      description: "Suggest the best built-in template(s) for a described purpose. Use this when the user describes WHAT the document is (e.g. 'Q4 board pack', 'API reference', 'wedding invitation', 'legal contract') without naming a template. Returns ranked recommendations with rationale.\n\nWhy this exists: AI assistants often guess template names that don't exist. This tool maps purpose → real template names from MDMagic's catalog, so convert_document doesn't fail with 'template not found'.",
      annotations: {
        title: "Recommend a template for a stated purpose",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      inputSchema: {
        type: "object" as const,
        properties: {
          purpose: {
            type: "string",
            description: "Free-text description of the document's purpose. Examples: 'Q4 board pack for investors', 'restaurant menu', 'developer API documentation', 'wedding invitation'."
          },
          topN: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "How many recommendations to return (1-5, default 3)"
          }
        },
        required: ["purpose"]
      },
      outputSchema: {
        type: "object" as const,
        properties: {
          purpose: { type: "string", description: "Echoes back the purpose that was matched" },
          rationale: { type: "string", description: "Why these templates were picked" },
          recommendations: { type: "array", items: { type: "string" }, description: "Ranked list of template IDs to pass to convert_document" }
        },
        required: ["recommendations"]
      }
    }
  ];
}

function createServer(): Server {
  return new Server(
    {
      name: 'mdmagic-mcp-server',
      version: '1.7.6'
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

  // Detect "discovery" requests that should work without an API key.
  // Discovery scanners (Smithery, the official MCP registry, glama, mcp.so)
  // probe `initialize` and `tools/list` to enumerate capabilities. We let
  // those through unauthenticated so the server gets indexed; any actual
  // tool execution (`tools/call`) still requires a valid API key.
  const DISCOVERY_METHODS = new Set([
    'initialize',
    'notifications/initialized',
    'tools/list',
    'resources/list',
    'resources/templates/list',
    'prompts/list',
    'ping'
  ]);

  function isDiscoveryRequest(body: any): boolean {
    if (!body) return false;
    if (typeof body === 'object' && !Array.isArray(body) && typeof body.method === 'string') {
      return DISCOVERY_METHODS.has(body.method);
    }
    if (Array.isArray(body) && body.length > 0) {
      return body.every((msg: any) =>
        msg && typeof msg.method === 'string' && DISCOVERY_METHODS.has(msg.method)
      );
    }
    return false;
  }

  // Stateless JSON-RPC handler for unauthenticated discovery probes.
  // Bypasses the SDK's session/protocol state machine — directories
  // (Smithery, MCP registry, glama, mcp.so) issue standalone JSON-RPC
  // calls without tracking sessions, so we answer them directly.
  // Tools/call is intentionally NOT handled here; it will fall through
  // to the auth gate above and 401.
  function handleDiscoveryProbe(req: express.Request, res: express.Response): void {
    const body = req.body;

    function answerOne(msg: any): any {
      if (!msg || typeof msg.method !== 'string') {
        return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
      }
      switch (msg.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: msg.params?.protocolVersion || '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'mdmagic-mcp-server', version: '1.7.6', title: 'MDMagic — Markdown to professional documents' }
            }
          };
        case 'notifications/initialized':
          // Notifications carry no response
          return null;
        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: { tools: getToolDefinitions() }
          };
        case 'resources/list':
          // We don't expose any resources; declare empty so directories
          // (Smithery, registry, glama) don't flag a "method not found" warning.
          return { jsonrpc: '2.0', id: msg.id, result: { resources: [] } };
        case 'resources/templates/list':
          return { jsonrpc: '2.0', id: msg.id, result: { resourceTemplates: [] } };
        case 'prompts/list':
          // No pre-canned prompts shipped. Same reason as resources/list.
          return { jsonrpc: '2.0', id: msg.id, result: { prompts: [] } };
        case 'ping':
          return { jsonrpc: '2.0', id: msg.id, result: {} };
        default:
          return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
      }
    }

    if (Array.isArray(body)) {
      const out = body.map(answerOne).filter(r => r !== null);
      res.status(200).json(out);
      return;
    }
    const reply = answerOne(body);
    if (reply === null) {
      res.status(202).end();
      return;
    }
    res.status(200).json(reply);
  }

  // MCP endpoint — handles POST (messages), GET (SSE stream), DELETE (session close)
  app.all('/mcp', async (req, res) => {
    // Extract API key from request headers
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const isDiscovery = req.method === 'POST' && isDiscoveryRequest(req.body);

    if (!apiKey) {
      if (isDiscovery) {
        // Unauthenticated discovery probe — serve metadata only
        try {
          handleDiscoveryProbe(req, res);
        } catch (error: any) {
          console.error('[HTTP] Discovery probe error:', error.message);
          if (!res.headersSent) {
            res.status(500).json({ error: `Discovery failed: ${error.message}` });
          }
        }
        return;
      }
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
      // Optional per-session defaults from request headers. These let
      // power users (and Smithery's gateway) preconfigure preferences
      // without having to specify them on every tool call.
      const sessionDefaults = {
        defaultTemplate: req.headers['x-mdmagic-default-template'] as string | undefined,
        defaultPageSize: req.headers['x-mdmagic-default-page-size'] as string | undefined,
        defaultOrientation: req.headers['x-mdmagic-default-orientation'] as string | undefined,
      };

      const authManager = new AuthManager(apiKey);
      const apiClient = new MDMagicApiClient(authManager, sessionDefaults);

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
