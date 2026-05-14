// Authentication manager for MDMagic MCP Server
import { AuthConfig } from '../types/index.js';
import { MCPError } from '../utils/errorHandler.js';

export class AuthManager {
  private config: AuthConfig;

  constructor(apiKey?: string) {
    this.config = {
      apiKey: apiKey || process.env.MDMAGIC_API_KEY || '',
      baseUrl: process.env.MDMAGIC_BASE_URL || 'https://api.mdmagic.ai',
      timeout: parseInt(process.env.REQUEST_TIMEOUT || '30000')
    };

    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.apiKey) {
      throw new MCPError(`❌ MDMAGIC_API_KEY environment variable is required.

💡 To get your API key:
1. Visit your MDMagic dashboard (${this.config.baseUrl}/dashboard)
2. Copy your personal API key (format: mdmagic-xxxxxxxxxxxxxxxx)
3. Set environment variable: export MDMAGIC_API_KEY="your-key-here"
4. Restart your MCP client`, 'MISSING_API_KEY');
    }

    // Soft format check: warn but DO NOT throw. The backend validates the
    // key on every API call anyway, so a real mismatch produces a clean
    // 401 from the server. Hard-failing here breaks safety-scanner flows
    // (Glama, Smithery, MCP registry tooling) that pass placeholder keys
    // to enumerate `tools/list` without ever calling `tools/call`.
    if (!this.config.apiKey.match(/^mdmagic-\d{16}$/)) {
      console.error(`⚠️  API key doesn't match expected format mdmagic-xxxxxxxxxxxxxxxx (16 digits). Server will start so directory scanners can enumerate tools, but tool calls will fail until a valid key is set.`);
    }
  }

  getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey,  // Exact header name from backend
      'Content-Type': 'application/json',
      'User-Agent': 'mdmagic-mcp-server/1.0.0',
      'x-client-type': 'mcp'  // Identify as MCP client for secure download handling
    };
  }

  getConfig(): AuthConfig {
    return { ...this.config };
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  getTimeout(): number {
    return this.config.timeout;
  }
}
