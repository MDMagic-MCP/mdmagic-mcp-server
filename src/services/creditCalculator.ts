// Credit calculation service for MDMagic MCP Server
import { MDMagicApiClient } from './apiClient.js';

export interface CreditCalculation {
  wordCount: number;
  pages: number;
  wordsPerPage: number;
  baseCredits: number;
  customTemplateCredits: number;
  pdfCredits: number;
  htmlCredits: number;
  totalCredits: number;
  breakdown: string;
}

export interface CreditBalance {
  total_credits: number;
  subscription_credits: number;
  purchased_credits: number;
}

export class CreditCalculator {
  private apiClient: MDMagicApiClient;
  private cachedWordsPerPage: number | null = null;
  private lastWordsFetch: number = 0;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour
  private readonly DEFAULT_WORDS_PER_PAGE = 300;

  constructor(apiClient: MDMagicApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Get words per page setting from admin_settings table
   */
  private async getWordsPerPage(): Promise<number> {
    const now = Date.now();
    
    // Return cached value if still valid
    if (this.cachedWordsPerPage && (now - this.lastWordsFetch) < this.CACHE_DURATION) {
      return this.cachedWordsPerPage;
    }

    try {
      // For now, use default until backend endpoint is ready
      // TODO: Implement API call to fetch from admin_settings
      this.cachedWordsPerPage = this.DEFAULT_WORDS_PER_PAGE;
      this.lastWordsFetch = now;
      return this.cachedWordsPerPage;
    } catch (error) {
      console.warn('[CreditCalculator] Error fetching words per page, using default:', error);
      return this.DEFAULT_WORDS_PER_PAGE;
    }
  }

  /**
   * Count words in markdown content, handling markdown syntax
   */
  private countWords(content: string): number {
    if (!content || typeof content !== 'string') {
      return 0;
    }

    return content
      // Remove code blocks (both ``` and `)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      // Remove markdown syntax characters
      .replace(/[#*_\[\]()]/g, ' ')
      // Remove multiple spaces and split by whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0).length;
  }

  /**
   * Detect if template is custom based on is_system field from API
   */
  private async isCustomTemplate(templateId: string): Promise<boolean> {
    if (!templateId || typeof templateId !== 'string') {
      return false;
    }
    
    try {
      // Get template info from API to check is_system field
      const response = await this.apiClient.client.get(`/api/templates/${templateId}`);
      const template = response.data;
      
      // Custom templates have is_system = false
      return !template.is_system;
    } catch (error) {
      console.error('[CreditCalculator] Error fetching template info:', error);
      
      // Fallback to UUID detection for backward compatibility
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(templateId);
    }
  }

  /**
   * Calculate credit cost for a conversion
   */
  async calculateCredits(
    content: string,
    templateId: string,
    outputFormats: string[]
  ): Promise<CreditCalculation> {
    try {
      const wordCount = this.countWords(content);
      const wordsPerPage = await this.getWordsPerPage();
      const pages = Math.ceil(wordCount / wordsPerPage);

      // Base credits: always DOCX conversion
      const baseCredits = pages;

      // Custom template bonus: +pages if custom template (is_system = false)
      const isCustom = await this.isCustomTemplate(templateId);
      const customTemplateCredits = isCustom ? pages : 0;

      // Format bonuses: +pages per additional format
      const pdfCredits = outputFormats.includes('pdf') ? pages : 0;
      const htmlCredits = outputFormats.includes('html') ? pages : 0;

      const totalCredits = baseCredits + customTemplateCredits + pdfCredits + htmlCredits;

      // Create detailed breakdown
      const factors = [];
      factors.push(`${baseCredits} base (DOCX)`);
      if (customTemplateCredits > 0) factors.push(`${customTemplateCredits} custom template`);
      if (pdfCredits > 0) factors.push(`${pdfCredits} PDF`);
      if (htmlCredits > 0) factors.push(`${htmlCredits} HTML`);

      const breakdown = `${pages} pages: ${factors.join(' + ')} = ${totalCredits} credits`;

      return {
        wordCount,
        pages,
        wordsPerPage,
        baseCredits,
        customTemplateCredits,
        pdfCredits,
        htmlCredits,
        totalCredits,
        breakdown
      };
    } catch (error) {
      console.error('[CreditCalculator] Error calculating credits:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Credit calculation failed: ${message}`);
    }
  }

  /**
   * Get user's current credit balance
   */
  async getCreditBalance(): Promise<CreditBalance> {
    try {
      // Use the new API endpoint we just created
      const response = await this.apiClient.client.get('/api/user/credits/balance');
      return response.data;
    } catch (error) {
      console.error('[CreditCalculator] Error fetching credit balance:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch credit balance: ${message}`);
    }
  }

  /**
   * Validate if user has sufficient credits for a conversion
   */
  async validateSufficientCredits(requiredCredits: number): Promise<{
    sufficient: boolean;
    currentBalance: number;
    message: string;
  }> {
    try {
      const balance = await this.getCreditBalance();
      const sufficient = balance.total_credits >= requiredCredits;

      return {
        sufficient,
        currentBalance: balance.total_credits,
        message: sufficient 
          ? `You have ${balance.total_credits} credits available`
          : `You need ${requiredCredits} credits but only have ${balance.total_credits}. Please add credits to continue.`
      };
    } catch (error) {
      console.error('[CreditCalculator] Error validating credits:', error);
      return {
        sufficient: false,
        currentBalance: 0,
        message: 'Unable to check credit balance. Please try again.'
      };
    }
  }
}