// Template listing tools implementation
import { MDMagicApiClient } from '../services/apiClient.js';
import { listTemplatesSchema, listBuiltinTemplatesSchema, listCustomTemplatesSchema } from '../utils/validation.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const CATEGORY_ORDER = ['Business', 'Creative', 'Professional', 'Technical'];

function groupByCategory(templates: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  templates.forEach(t => {
    const cat = t.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });
  return grouped;
}

function renderGroupedBuiltins(templates: any[]): string {
  const grouped = groupByCategory(templates);
  const orderedCategories = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c))
  ];
  let out = '';
  orderedCategories.forEach(cat => {
    out += `### ${cat} (${grouped[cat].length})\n\n`;
    grouped[cat].forEach(t => {
      out += `- **${t.name}** (\`${t.id}\`)`;
      if (t.description) out += ` — ${t.description}`;
      out += '\n';
    });
    out += '\n';
  });
  return out;
}

export async function handleListAllTemplates(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    const input = listTemplatesSchema.parse(args);
    console.error(`[list_all_templates] Fetching all templates${input.category ? ` (category=${input.category})` : ''}...`);

    // Fetch both built-in and custom templates
    const [builtinResponse, customResponse] = await Promise.all([
      apiClient.getTemplates(),
      apiClient.getCustomTemplates()
    ]);

    let builtinTemplates = builtinResponse.templates || [];
    const customTemplates = customResponse.templates || [];

    if (input.category) {
      builtinTemplates = builtinTemplates.filter(
        t => (t.category || '').toLowerCase() === input.category!.toLowerCase()
      );
    }

    const allTemplates = [...builtinTemplates, ...customTemplates];

    if (allTemplates.length === 0) {
      const msg = input.category
        ? `📝 **No templates found in category "${input.category}"**\n\nTry calling \`list_all_templates\` without a category filter to see all available templates.`
        : "📝 **No templates available**\n\nNo templates found in the system.";
      return { content: [{ type: "text", text: msg }] };
    }

    let output = `📚 **Available Templates** (${allTemplates.length} total${input.category ? `, category=${input.category}` : ''})\n\n`;

    if (builtinTemplates.length > 0) {
      output += `## 🏢 Built-in Templates (${builtinTemplates.length})\n\n`;
      output += renderGroupedBuiltins(builtinTemplates);
    }

    if (customTemplates.length > 0) {
      output += `## 🎨 Your Custom Templates (${customTemplates.length})\n\n`;
      customTemplates.forEach(template => {
        output += `- **${template.name}** (\`${template.id}\`)`;
        if (template.description) output += ` — ${template.description}`;
        output += '\n';
      });
      output += '\n';
    }

    output += '💡 **Usage:** Pass the template ID (in backticks) as `templateName` to `convert_document`.';

    return { content: [{ type: "text", text: output }] };

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
    console.error(`[list_builtin_templates] Fetching built-in templates${input.category ? ` (category=${input.category})` : ''}...`);

    const response = await apiClient.getTemplates();
    let templates = response.templates || [];

    if (input.category) {
      templates = templates.filter(
        t => (t.category || '').toLowerCase() === input.category!.toLowerCase()
      );
    }

    if (templates.length === 0) {
      const msg = input.category
        ? `📝 **No built-in templates in category "${input.category}"**\n\nValid categories: Business, Creative, Professional, Technical.`
        : "📝 **No built-in templates available**\n\nNo built-in templates found in the system.";
      return { content: [{ type: "text", text: msg }] };
    }

    let output = `🏢 **Built-in Templates** (${templates.length} available${input.category ? `, category=${input.category}` : ''})\n\n`;
    output += renderGroupedBuiltins(templates);
    output += '💡 **Usage:** Pass the template ID (in backticks) as `templateName` to `convert_document`.';

    return { content: [{ type: "text", text: output }] };

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