// get_template_details — return paper-size + orientation matrix for a template
import { MDMagicApiClient } from '../services/apiClient.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const getTemplateDetailsSchema = z.object({
  templateName: z.string().describe('Template ID or name (e.g. Executive_Platinum, or a UUID for custom templates)')
});

const PAGE_SIZES = ['A3', 'A4', 'Executive', 'US_Legal', 'US_Letter'];
const ORIENTATIONS = ['Portrait', 'Landscape'];

export async function handleGetTemplateDetails(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    const input = getTemplateDetailsSchema.parse(args);
    console.error(`[get_template_details] Looking up: ${input.templateName}`);

    const [builtinResp, customResp] = await Promise.all([
      apiClient.getTemplates(),
      apiClient.getCustomTemplates().catch(() => ({ templates: [] }))
    ]);

    const all = [...(builtinResp.templates || []), ...(customResp.templates || [])];
    const target = all.find(t =>
      t.id === input.templateName ||
      t.name.toLowerCase() === input.templateName.toLowerCase() ||
      t.id.toLowerCase() === input.templateName.toLowerCase()
    );

    if (!target) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Template not found**: \`${input.templateName}\`\n\nCall \`list_all_templates\` to see available templates.`
        }]
      };
    }

    const lines = [
      `📐 **Template details: ${target.name}**`,
      '',
      `**ID**: \`${target.id}\``,
      `**Type**: ${target.type === 'built-in' ? '🏢 Built-in' : '🎨 Custom'}`,
    ];
    if (target.category) lines.push(`**Category**: ${target.category}`);
    if (target.description) lines.push(`**Description**: ${target.description}`);

    lines.push('');
    lines.push('**Available variants** (all combinations supported):');
    lines.push('');
    lines.push('| Page size | Portrait | Landscape |');
    lines.push('|---|:---:|:---:|');
    PAGE_SIZES.forEach(size => {
      lines.push(`| ${size} | ✅ | ✅ |`);
    });
    lines.push('');
    lines.push(`**Default**: A4, Portrait. Override with the \`pageSize\` and \`orientation\` arguments to \`convert_document\`.`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error: any) {
    console.error('[get_template_details] Error:', error.message);
    throw error;
  }
}
