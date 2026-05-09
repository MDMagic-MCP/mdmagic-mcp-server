// Convert document tool implementation
import { MDMagicApiClient } from '../services/apiClient.js';
import { FileProcessor } from '../services/fileHandler.js';
import { convertDocumentSchema } from '../utils/validation.js';
import { MCPError } from '../utils/errorHandler.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CreditCalculator } from '../services/creditCalculator.js';
import * as path from 'node:path';

/**
 * Produce a clean output filename from caller hints.
 *
 * Priority:
 *   1. Explicit `fileName` argument from the MCP caller (basename, no extension).
 *   2. The basename of `filePath` if the caller provided a file path.
 *   3. Slug derived from the markdown's first H1 heading.
 *   4. Undefined (let the API generate its own — last resort).
 *
 * The returned value is a plain basename (no extension, no path separators)
 * so the API can append the right extension per format.
 */
function deriveFileName(
  explicit: string | undefined,
  filePath: string | undefined,
  content: string | undefined,
): string | undefined {
  const sanitize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')   // non-alphanum -> hyphen
      .replace(/^-+|-+$/g, '')        // trim leading/trailing hyphens
      .slice(0, 80);                   // cap length

  if (explicit && explicit.trim()) {
    // Strip any extension, sanitize
    const base = path.basename(explicit, path.extname(explicit));
    const cleaned = sanitize(base);
    if (cleaned) return cleaned;
  }

  if (filePath && filePath.trim()) {
    const base = path.basename(filePath, path.extname(filePath));
    const cleaned = sanitize(base);
    if (cleaned) return cleaned;
  }

  if (content) {
    // First H1 heading — match `# Heading` not `## Heading`
    const match = content.match(/^[ \t]*#[ \t]+(.+?)[ \t]*$/m);
    if (match) {
      const cleaned = sanitize(match[1]);
      if (cleaned) return cleaned;
    }
  }

  return undefined;
}

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

    // Derive output filename so downloads aren't named content-1234567890.pdf
    const derivedFileName = deriveFileName(
      input.fileName,
      input.filePath,
      processedContent.content,
    );

    if (derivedFileName) {
      console.error(`[convert_document] Output filename: ${derivedFileName}`);
    }

    // Call MDMagic API with calculated credits
    const result = await apiClient.convertDocument({
      content: processedContent.content,
      templateId: input.templateName,
      outputFormat: outputFormats,  // Send array of formats
      pageSize: input.pageSize,
      orientation: input.orientation,
      expectedCredits: creditCalculation.totalCredits,
      fileName: derivedFileName
    });

    const r = result as any;
    const apiExpiresAt = r.expiresAt as string | undefined;
    const apiFileName = r.fileName as string | undefined;
    const creditsUsed = r.creditsUsed as number | undefined;
    const balanceAfter = r.balanceAfter as number | undefined;

    // Fall back to a 60-min estimate if API didn't return expiresAt (older API builds)
    const expiresAtDisplay = apiExpiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();

    console.error(`[convert_document] Conversion successful: ${result.downloadUrl} (${creditsUsed ?? '?'} credits, ${balanceAfter ?? '?'} remaining)`);

    const lines = [
      '✅ **Document converted successfully!**',
      '',
      `📁 **Download**: [${apiFileName || 'Click here to download'}](${result.downloadUrl})`,
    ];
    if (apiFileName) lines.push(`📄 **File**: ${apiFileName}`);
    if (creditsUsed !== undefined) lines.push(`📊 **Credits used**: ${creditsUsed}`);
    if (balanceAfter !== undefined) lines.push(`💰 **Balance remaining**: ${balanceAfter}`);
    lines.push(`⏰ **Expires**: ${expiresAtDisplay}`);
    lines.push('');
    lines.push('💡 Your document is ready! The link expires in 60 minutes.');

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n')
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