// Convert document tool implementation
import { MDMagicApiClient } from '../services/apiClient.js';
import { FileProcessor } from '../services/fileHandler.js';
import { convertDocumentSchema } from '../utils/validation.js';
import { MCPError } from '../utils/errorHandler.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CreditCalculator } from '../services/creditCalculator.js';

export async function handleConvertDocument(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  const fileProcessor = new FileProcessor();

  try {
    // Validate input using Zod schema
    const input = convertDocumentSchema.parse(args);

    console.error(`[convert_document] Starting conversion: ${input.templateName} → ${input.outputFormat}`);

    // Process input content (text, file, or base64)
    const processedContent = await fileProcessor.processInput({
      content: input.content,
      filePath: input.filePath,
      fileContent: input.fileContent
    });

    console.error(`[convert_document] Processed ${processedContent.type} content: ${processedContent.size} bytes`);

    // Handle "all" format conversion: all → ['docx', 'pdf', 'html']
    let outputFormats: string[];
    if (input.outputFormat === 'all') {
      outputFormats = ['docx', 'pdf', 'html'];
      console.error(`[convert_document] Converting "all" format to: ${outputFormats.join(', ')}`);
    } else {
      outputFormats = [input.outputFormat];
    }

    // Calculate credits before conversion
    const creditCalculator = new CreditCalculator(apiClient);
    const creditCalculation = await creditCalculator.calculateCredits(
      processedContent.content,
      input.templateName,
      outputFormats
    );

    console.error(`[convert_document] Credit calculation: ${creditCalculation.breakdown}`);

    // Call MDMagic API with calculated credits
    const result = await apiClient.convertDocument({
      content: processedContent.content,
      templateId: input.templateName,
      outputFormat: outputFormats,  // Send array of formats
      pageSize: input.pageSize,
      orientation: input.orientation,
      expectedCredits: creditCalculation.totalCredits
    });

    // Calculate expiration time (15 minutes from now)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    console.error(`[convert_document] Conversion successful: ${result.downloadUrl}`);

    return {
      content: [
        {
          type: "text",
          text: `✅ **Document converted successfully!**

📁 **Download**: [Click here to download](${result.downloadUrl})
📊 **Credits Used**: ${(result as any).creditsUsed || 'Credit info not available'}
⏰ **Expires**: ${expiresAt}

💡 Your document is ready! The download link will expire in 15 minutes.`
        }
      ]
    };

  } catch (error: any) {
    console.error('[convert_document] ❌ Conversion error:', error);

    // Handle specific API errors
    if (error instanceof MCPError) {
      return {
        content: [
          {
            type: "text",
            text: `❌ API Error: ${error.message}

💡 ${(error as any).details || 'Please check your input and try again.'}`
          }
        ],
        isError: true
      };
    }

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n');
      return {
        content: [
          {
            type: "text",
            text: `❌ Invalid input parameters:

${issues}

💡 Please check your input and try again.`
          }
        ],
        isError: true
      };
    }

    throw error; // Re-throw to be handled by unified handler
  }
}