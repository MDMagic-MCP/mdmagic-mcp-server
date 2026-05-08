// Credit balance checker tool for MDMagic MCP Server
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CreditCalculator } from '../services/creditCalculator.js';
import { handleApiError } from '../utils/errorHandler.js';

export const checkCreditBalance: Tool = {
  name: 'check_credit_balance',
  description: 'Check your current credit balance across subscription and purchased credits',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

export async function handleCheckCreditBalance(
  creditCalculator: CreditCalculator
): Promise<string> {
  try {
    console.error('[CheckCreditBalance] Fetching user credit balance...');
    
    const balance = await creditCalculator.getCreditBalance();
    
    const response = [
      `💰 **Your Current Credit Balance**`,
      ``,
      `**Total Credits:** ${balance.total_credits}`,
      `- Subscription Credits: ${balance.subscription_credits}`,
      `- Purchased Credits: ${balance.purchased_credits}`,
      ``,
      balance.total_credits > 0 
        ? `✅ You have sufficient credits for conversions.`
        : `⚠️  You need to add credits to perform conversions.`
    ].join('\n');

    console.error('[CheckCreditBalance] ✅ Successfully retrieved credit balance');
    return response;

  } catch (error) {
    console.error('[CheckCreditBalance] ❌ Error checking credit balance:', error);
    const mcpError = handleApiError(error);
    return `❌ Error checking credit balance: ${mcpError.message}`;
  }
}