// Credit cost estimation tool for MDMagic MCP Server
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CreditCalculator } from '../services/creditCalculator.js';
import { handleApiError } from '../utils/errorHandler.js';

export const estimateConversionCost: Tool = {
  name: 'estimate_conversion_cost',
  description: 'Estimate credit cost for a conversion without performing it. Shows word count, page calculation, and detailed credit breakdown.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Markdown content to estimate credit cost for'
      },
      templateName: {
        type: 'string',
        description: 'Template ID or name (UUID for custom templates, name for system templates)'
      },
      outputFormat: {
        type: 'string',
        enum: ['docx', 'pdf', 'html', 'all', 'all-formats'],
        description: 'Output format(s): docx (DOCX only), pdf (DOCX+PDF), html (DOCX+HTML), all/all-formats (DOCX+PDF+HTML)'
      },
      pageSize: {
        type: 'string',
        enum: ['A3', 'A4', 'Executive', 'US_Legal', 'US_Letter'],
        description: 'Page size for the document',
        default: 'A4'
      },
      orientation: {
        type: 'string',
        enum: ['Portrait', 'Landscape'],
        description: 'Page orientation',
        default: 'Portrait'
      }
    },
    required: ['content', 'templateName', 'outputFormat']
  }
};

export async function handleEstimateConversionCost(
  creditCalculator: CreditCalculator,
  args: {
    content: string;
    templateName: string;
    outputFormat: string;
    pageSize?: string;
    orientation?: string;
  }
): Promise<string> {
  try {
    console.error('[EstimateConversionCost] Calculating credit estimate...');
    
    const { content, templateName, outputFormat } = args;
    
    // Determine output formats based on request
    let outputFormats: string[];
    if (outputFormat === 'docx') {
      outputFormats = ['docx']; // DOCX only
    } else if (outputFormat === 'all' || outputFormat === 'all-formats') {
      outputFormats = ['docx', 'pdf', 'html']; // ALL THREE FORMATS
    } else {
      outputFormats = ['docx', outputFormat]; // DOCX + one other format
    }

    // Calculate credits
    const calculation = await creditCalculator.calculateCredits(content, templateName, outputFormats);
    
    // Get current balance for comparison
    const balance = await creditCalculator.getCreditBalance();
    
    // Format output description
    const formatDescription = outputFormats.length === 1 
      ? 'DOCX only'
      : outputFormats.length === 2
        ? `DOCX + ${outputFormats[1].toUpperCase()}`
        : 'DOCX + PDF + HTML (all formats)';

    // Determine template type
    const templateType = templateName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? 'Custom Template'
      : 'System Template';

    const response = [
      `💳 **Credit Cost Estimate**`,
      ``,
      `**Content Analysis:**`,
      `- Word Count: ${calculation.wordCount} words`,
      `- Pages: ${calculation.pages} (${calculation.wordsPerPage} words per page)`,
      `- Template: ${templateType}`,
      `- Output: ${formatDescription}`,
      ``,
      `**Credit Breakdown:**`,
      `- ${calculation.breakdown}`,
      ``,
      `**Your Balance:**`,
      `- Current Credits: ${balance.total_credits}`,
      `- After Conversion: ${balance.total_credits - calculation.totalCredits} credits`,
      ``,
      balance.total_credits >= calculation.totalCredits
        ? `✅ **You have sufficient credits!** Would you like to proceed with the conversion?`
        : `❌ **Insufficient credits!** You need ${calculation.totalCredits - balance.total_credits} more credits to perform this conversion.`
    ].join('\n');

    console.error(`[EstimateConversionCost] ✅ Estimated ${calculation.totalCredits} credits for conversion`);
    return response;

  } catch (error) {
    console.error('[EstimateConversionCost] ❌ Error estimating conversion cost:', error);
    const mcpError = handleApiError(error);
    return `❌ Error estimating conversion cost: ${mcpError.message}`;
  }
}