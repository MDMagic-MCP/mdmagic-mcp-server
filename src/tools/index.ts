// Tool registration index - UNIFIED HANDLER ARCHITECTURE
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MDMagicApiClient } from '../services/apiClient.js';
import { CreditCalculator } from '../services/creditCalculator.js';
import { handleConvertDocument } from './convertDocument.js';
import { handleListAllTemplates, handleListBuiltinTemplates, handleListCustomTemplates } from './listTemplates.js';
import { handleShowDefaultSettings } from './userSettings.js';
import { handleCheckCreditBalance, handleEstimateConversionCost } from './creditTools.js';

export async function registerAllTools(
  server: Server,
  apiClient: MDMagicApiClient
): Promise<void> {
  console.error('🔧 Registering MCP tools with unified handler...');

  // Initialize credit calculator for credit tools
  const creditCalculator = new CreditCalculator(apiClient);

  // Register a SINGLE unified handler for all tools
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
    const toolName = request.params.name;
    console.error(`[MCP] Handling tool request: ${toolName}`);

    try {
      switch (toolName) {
        case 'convert_document':
          return await handleConvertDocument(apiClient, request.params.arguments);
          
        case 'list_all_templates':
          return await handleListAllTemplates(apiClient, request.params.arguments);
          
        case 'list_builtin_templates':
          return await handleListBuiltinTemplates(apiClient, request.params.arguments);
          
        case 'list_custom_templates':
          return await handleListCustomTemplates(apiClient, request.params.arguments);
          
        case 'show_default_settings':
          return await handleShowDefaultSettings(apiClient, request.params.arguments);
          
        case 'check_credit_balance':
          return await handleCheckCreditBalance(creditCalculator, request.params.arguments);
          
        case 'estimate_conversion_cost':
          return await handleEstimateConversionCost(creditCalculator, request.params.arguments);
          
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      console.error(`[MCP] Error handling ${toolName}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });

  console.error('✅ All MCP tools registered successfully with unified handler');
  console.error('📋 Available tools: convert_document, list_all_templates, list_builtin_templates, list_custom_templates, show_default_settings, check_credit_balance, estimate_conversion_cost');
}