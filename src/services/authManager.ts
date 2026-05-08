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

    // Use exact same validation as backend
    if (!this.config.apiKey.match(/^mdmagic-\d{16}$/)) {
      throw new MCPError(`❌ Invalid API key format. Expected: mdmagic-xxxxxxxxxxxxxxxx (exactly 16 digits)

💡 Check your API key format from your MDMagic dashboard`, 'INVALID_API_KEY_FORMAT');
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
