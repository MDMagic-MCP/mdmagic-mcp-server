// Credit management tools for MDMagic MCP Server
import { CreditCalculator } from '../services/creditCalculator.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { estimateConversionCostSchema } from '../utils/validation.js';

export async function handleCheckCreditBalance(
  creditCalculator: CreditCalculator,
  args: any
): Promise<CallToolResult> {
  try {
    console.error('[check_credit_balance] Checking credit balance...');
    
    const balance = await creditCalculator.getCreditBalance();
    
    return {
      content: [
        {
          type: 'text',
          text: `💰 **Your Current Credit Balance**

**Total Credits:** ${balance.total_credits}
- Subscription Credits: ${balance.subscription_credits}
- Purchased Credits: ${balance.purchased_credits}

${balance.total_credits > 0 
  ? `✅ You have sufficient credits for conversions.`
  : `⚠️  You need to add credits to perform conversions.`}

💡 Credits are used for document conversions. Each conversion costs credits based on document length and output format.`
        }
      ]
    };
  } catch (error: any) {
    console.error('[check_credit_balance] Error:', error);
    throw error; // Let unified handler deal with it
  }
}

export async function handleEstimateConversionCost(
  creditCalculator: CreditCalculator,
  args: any
): Promise<CallToolResult> {
  try {
    console.error('[estimate_conversion_cost] Estimating conversion cost...');
    const input = estimateConversionCostSchema.parse(args);
    
    const { content, templateName, outputFormat } = input;
    
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
    
    return {
      content: [
        {
          type: 'text',
          text: `💳 **Credit Cost Estimate**

**Content Analysis:**
- Word Count: ${calculation.wordCount} words
- Template: ${templateType}
- Output: ${formatDescription}

**Credit Breakdown:**
- ${calculation.breakdown}

**Your Balance:**
- Current Credits: ${balance.total_credits}
- After Conversion: ${balance.total_credits - calculation.totalCredits} credits

${balance.total_credits >= calculation.totalCredits
  ? `✅ **You have sufficient credits!** Would you like to proceed with the conversion?`
  : `❌ **Insufficient credits!** You need ${calculation.totalCredits - balance.total_credits} more credits to perform this conversion.`}

💡 This is an estimate. Actual cost may vary slightly based on document complexity.`
        }
      ]
    };
  } catch (error: any) {
    console.error('[estimate_conversion_cost] Error:', error);
    
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `❌ Invalid parameters:

${issues}

💡 Please check your input and try again.`
          }
        ],
        isError: true
      };
    }
    
    throw error; // Let unified handler deal with it
  }
}