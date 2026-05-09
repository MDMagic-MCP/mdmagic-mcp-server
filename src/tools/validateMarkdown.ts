// validate_markdown — pre-flight markdown check before conversion
import { MDMagicApiClient } from '../services/apiClient.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const validateMarkdownSchema = z.object({
  content: z.string().describe('Markdown content to validate'),
  filename: z.string().optional().describe('Optional filename for the response label')
});

const STATUS_EMOJI: Record<string, string> = {
  green: '✅',
  amber: '⚠️',
  red: '❌'
};

export async function handleValidateMarkdown(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    const input = validateMarkdownSchema.parse(args);
    console.error(`[validate_markdown] Validating ${input.content.length} bytes...`);

    const result = await apiClient.validateMarkdownContent(input.content, input.filename);

    const emoji = STATUS_EMOJI[result.status] || '❓';
    const detectedList = Object.entries(result.detectedFeatures || {})
      .filter(([, v]) => v)
      .map(([k]) => k);

    const lines = [
      `${emoji} **Markdown validation: ${result.status.toUpperCase()}**`,
      '',
      `**File**: ${result.filename}`,
      `**Detected format**: ${result.inputFormat || 'unknown'}`,
      `**Message**: ${result.message}`,
    ];

    if (detectedList.length > 0) {
      lines.push('', `**Features detected**: ${detectedList.join(', ')}`);
    }

    if (result.status === 'red') {
      lines.push('', '⚠️ **Recommendation**: Fix the issues above before calling `convert_document` — a red status usually produces broken output and still costs credits.');
    } else if (result.status === 'amber') {
      lines.push('', 'ℹ️ Conversion will work but may have minor rendering issues. Safe to proceed.');
    } else {
      lines.push('', '✅ Ready for conversion. Call `convert_document` next.');
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }]
    };
  } catch (error: any) {
    console.error('[validate_markdown] Error:', error.message);
    throw error;
  }
}
