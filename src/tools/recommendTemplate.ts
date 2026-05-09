// recommend_template — semantic match from purpose to template
import { MDMagicApiClient } from '../services/apiClient.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const recommendTemplateSchema = z.object({
  purpose: z.string().describe('What the document is for. Examples: "Q4 board pack", "API reference docs", "wedding invitation", "legal contract", "data analysis report".'),
  topN: z.number().int().min(1).max(5).default(3).describe('How many recommendations to return (1-5).')
});

// Keyword → template mapping. The user's actual built-in template names are kept here
// so this works even when the API is unreachable for category info.
// Templates the API actually exposes (verified against the templates table):
//   Business: Business_Purple, Executive_Platinum, Financial_Blue, Premium_Bronze, Professional_Azure
//   Creative: Artistic_Aqua, Cheese_Burger, Designer_Indigo, Minimalist_Pro, Sage_Serenity, Sunset_Vibes
//   Professional: Legal_Burgundy, Modern_Legal
//   Technical: Code_Documentation, Deep_Data_Blue
const KEYWORD_RULES: Array<{ patterns: RegExp[]; recommend: string[]; rationale: string }> = [
  // Legal / contracts
  {
    patterns: [/\b(legal|contract|agreement|nda|terms|policy|compliance|statute|brief|affidavit|deed|will|testament)\b/i],
    recommend: ['Legal_Burgundy', 'Modern_Legal', 'Executive_Platinum'],
    rationale: 'Legal templates emphasise traditional formatting, signature blocks, and section numbering.'
  },
  // Executive / board / strategy
  {
    patterns: [/\b(board|exec|executive|strategy|strategic|c[\-\s]?suite|leadership|quarterly|annual report|investor|stakeholder|q[1-4]\b)\b/i],
    recommend: ['Executive_Platinum', 'Premium_Bronze', 'Professional_Azure'],
    rationale: 'Executive-grade typography and conservative styling suited to leadership audiences.'
  },
  // Finance / numbers / accounting
  {
    patterns: [/\b(financial|finance|budget|accounting|p&l|balance sheet|forecast|invoice|revenue|earnings)\b/i],
    recommend: ['Financial_Blue', 'Executive_Platinum', 'Professional_Azure'],
    rationale: 'Financial templates handle tables, footnotes, and figure-heavy content cleanly.'
  },
  // Code / API / technical docs
  {
    patterns: [/\b(api|reference|sdk|developer|technical doc|architecture|engineering|spec(ification)?|readme|changelog|release notes|code|programming|library)\b/i],
    recommend: ['Code_Documentation', 'Deep_Data_Blue', 'Professional_Azure'],
    rationale: 'Technical templates render code blocks, diagrams, and structured headings well.'
  },
  // Data / analytics / research
  {
    patterns: [/\b(data|analytics|analysis|research|study|metrics|kpi|dashboard|report card|whitepaper|white paper)\b/i],
    recommend: ['Deep_Data_Blue', 'Financial_Blue', 'Code_Documentation'],
    rationale: 'Data-focused templates support charts, tables, and figure captions.'
  },
  // Creative / marketing / fun
  {
    patterns: [/\b(invitation|invite|wedding|party|birthday|menu|brochure|flyer|poster|marketing|campaign|brand|creative)\b/i],
    recommend: ['Designer_Indigo', 'Artistic_Aqua', 'Sunset_Vibes'],
    rationale: 'Creative templates use distinctive typography and colour to grab attention.'
  },
  // Food / restaurant / casual
  {
    patterns: [/\b(menu|recipe|food|restaurant|cafe|cooking)\b/i],
    recommend: ['Cheese_Burger', 'Sunset_Vibes', 'Designer_Indigo'],
    rationale: 'Casual, food-friendly typography that reads warm rather than corporate.'
  },
  // Wellness / lifestyle / mindfulness
  {
    patterns: [/\b(wellness|yoga|meditation|mindfulness|health|wellbeing|lifestyle|nature|garden|holistic)\b/i],
    recommend: ['Sage_Serenity', 'Artistic_Aqua', 'Minimalist_Pro'],
    rationale: 'Calm, nature-inspired styling appropriate for wellness/lifestyle content.'
  },
  // Minimalist / clean
  {
    patterns: [/\b(minimal|clean|simple|stripped|bare)\b/i],
    recommend: ['Minimalist_Pro', 'Professional_Azure', 'Designer_Indigo'],
    rationale: 'Clean, low-ornament templates that put content first.'
  },
  // Generic business / proposal / corporate
  {
    patterns: [/\b(business|corporate|proposal|pitch|deck|memo|briefing)\b/i],
    recommend: ['Professional_Azure', 'Business_Purple', 'Executive_Platinum'],
    rationale: 'General-purpose business templates suited to internal and external audiences.'
  },
];

export async function handleRecommendTemplate(
  apiClient: MDMagicApiClient,
  args: any
): Promise<CallToolResult> {
  try {
    const input = recommendTemplateSchema.parse(args);
    console.error(`[recommend_template] Purpose: "${input.purpose}"`);

    // Score each rule by number of pattern matches against the purpose string
    const matched: Array<{ recommend: string[]; rationale: string; score: number }> = [];
    for (const rule of KEYWORD_RULES) {
      let score = 0;
      for (const pat of rule.patterns) {
        if (pat.test(input.purpose)) score++;
      }
      if (score > 0) matched.push({ ...rule, score });
    }

    // Pick winning rule (highest score; ties → first declared, which is most specific)
    matched.sort((a, b) => b.score - a.score);
    const winner = matched[0];

    let picked: string[];
    let rationale: string;
    if (winner) {
      picked = winner.recommend.slice(0, input.topN);
      rationale = winner.rationale;
    } else {
      // No strong match — recommend safe defaults that work for most prose
      picked = ['Professional_Azure', 'Executive_Platinum', 'Minimalist_Pro'].slice(0, input.topN);
      rationale = 'No strong keyword match — these are versatile templates that work for most general-purpose documents.';
    }

    // Optionally: validate the recommended templates exist on the API.
    // If the catalog has shifted, fall back gracefully without erroring.
    let validated = picked;
    try {
      const builtin = await apiClient.getTemplates();
      const known = new Set((builtin.templates || []).map(t => (t.id || '').toLowerCase()));
      validated = picked.filter(p => known.has(p.toLowerCase()));
      if (validated.length === 0) {
        validated = picked; // API returned nothing useful; show recommendations anyway
      }
    } catch {
      // Network/auth failure — keep the keyword-derived list
    }

    const lines = [
      `🎯 **Template recommendations for: "${input.purpose}"**`,
      '',
      `**Why these**: ${rationale}`,
      '',
      `**Top ${validated.length}:**`,
    ];
    validated.forEach((id, i) => {
      lines.push(`${i + 1}. \`${id}\``);
    });
    lines.push('');
    lines.push('💡 Pass any of these as `templateName` to `convert_document`. Call `list_all_templates` to see the full catalog including custom templates.');

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error: any) {
    console.error('[recommend_template] Error:', error.message);
    throw error;
  }
}
