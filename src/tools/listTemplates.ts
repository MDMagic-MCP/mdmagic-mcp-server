// Template listing tools implementation
import { MDMagicApiClient } from '../services/apiClient.js';
import { listTemplatesSchema, listBuiltinTemplatesSchema, listCustomTemplatesSchema } from '../utils/validation.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleListAllTemplates(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    const input = listTemplatesSchema.parse(args);
    console.error('[list_all_templates] Fetching all templates (built-in + custom)...');

    // Fetch both built-in and custom templates
    const [builtinResponse, customResponse] = await Promise.all([
      apiClient.getTemplates(),
      apiClient.getCustomTemplates()
    ]);

    const builtinTemplates = builtinResponse.templates || [];
    const customTemplates = customResponse.templates || [];
    const allTemplates = [...builtinTemplates, ...customTemplates];

    if (allTemplates.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "📝 **No templates available**\n\nNo templates found in the system."
          }
        ]
      };
    }

    let output = `📚 **All Available Templates** (${allTemplates.length} total)\n\n`;

    // Built-in templates section
    if (builtinTemplates.length > 0) {
      output += `## 🏢 Built-in Templates (${builtinTemplates.length})\n\n`;
      builtinTemplates.forEach(template => {
        output += `**${template.name}** (\`${template.id}\`)\n`;
        if (template.description) {
          output += `  ${template.description}\n`;
        }
        output += '\n';
      });
    }

    // Custom templates section
    if (customTemplates.length > 0) {
      output += `## 🎨 Your Custom Templates (${customTemplates.length})\n\n`;
      customTemplates.forEach(template => {
        output += `**${template.name}** (\`${template.id}\`)\n`;
        if (template.description) {
          output += `  ${template.description}\n`;
        }
        output += `  📁 Type: ${template.type}\n\n`;
      });
    }

    output += '💡 **Usage:** Use the template ID (in backticks) with the `convert_document` tool.';

    return {
      content: [
        {
          type: "text",
          text: output
        }
      ]
    };

  } catch (error: any) {
    console.error('[list_all_templates] Error:', error.message);
    throw error;
  }
}

export async function handleListBuiltinTemplates(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    const input = listBuiltinTemplatesSchema.parse(args);
    console.error('[list_builtin_templates] Fetching built-in templates...');

    const response = await apiClient.getTemplates();
    const templates = response.templates || [];

    if (templates.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "📝 **No built-in templates available**\n\nNo built-in templates found in the system."
          }
        ]
      };
    }

    let output = `🏢 **Built-in Templates** (${templates.length} available)\n\n`;
    
    templates.forEach(template => {
      output += `**${template.name}** (\`${template.id}\`)\n`;
      if (template.description) {
        output += `  ${template.description}\n`;
      }
      output += '\n';
    });

    output += '💡 **Usage:** Use the template ID (in backticks) with the `convert_document` tool.';

    return {
      content: [
        {
          type: "text", 
          text: output
        }
      ]
    };

  } catch (error: any) {
    console.error('[list_builtin_templates] Error:', error.message);
    throw error;
  }
}

export async function handleListCustomTemplates(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    const input = listCustomTemplatesSchema.parse(args);
    console.error('[list_custom_templates] Fetching custom templates...');

    const response = await apiClient.getCustomTemplates();
    const templates = response.templates || [];

    if (templates.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `🎨 **No custom templates available**

You don't have any custom templates yet. Custom templates are user-specific templates that you can upload through the MDMagic dashboard.

💡 **To add custom templates:**
1. Visit your MDMagic dashboard
2. Go to Templates section  
3. Upload your custom Word (.docx) templates`
          }
        ]
      };
    }

    let output = `🎨 **Your Custom Templates** (${templates.length} available)\n\n`;
    
    templates.forEach(template => {
      output += `**${template.name}** (\`${template.id}\`)\n`;
      if (template.description) {
        output += `  ${template.description}\n`;
      }
      output += `  📁 Type: ${template.type}\n\n`;
    });

    output += '💡 **Usage:** Use the template ID (in backticks) with the `convert_document` tool.';

    return {
      content: [
        {
          type: "text",
          text: output
        }
      ]
    };

  } catch (error: any) {
    console.error('[list_custom_templates] Error:', error.message);
    throw error;
  }
}