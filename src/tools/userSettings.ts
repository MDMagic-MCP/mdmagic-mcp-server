// User settings tools
import { MDMagicApiClient } from '../services/apiClient.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleShowDefaultSettings(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    console.error('[show_default_settings] Fetching user default settings...');

    // For now, return default values since we need to implement user defaults API
    return {
      content: [
        {
          type: "text",
          text: `📋 **Your Default Document Settings**

**📄 Default Page Size:** A4
**🔄 Default Orientation:** Portrait

💡 **How to use:**
- When converting documents, these defaults are used automatically
- You can override by specifying \`pageSize\` and \`orientation\` in \`convert_document\`
- Available page sizes: A3, A4, Executive, US_Legal, US_Letter
- Available orientations: Portrait, Landscape`
        }
      ]
    };

  } catch (error: any) {
    console.error('[show_default_settings] Error:', error.message);
    throw error;
  }
}