// Input validation utilities using Zod
import { z } from 'zod';

// Convert document input schema
export const convertDocumentSchema = z.object({
  content: z.string().optional().describe("Raw markdown text content"),
  filePath: z.string().optional().describe("Path to markdown file (VS Code integration)"),
  fileContent: z.string().optional().describe("Base64 encoded file content"),
  fileName: z.string().optional().describe("Optional desired base name for the output file (without extension)"),
  templateName: z.string().describe("Template to use for conversion. Call list_all_templates to see real options."),
  outputFormat: z.enum(['docx', 'pdf', 'html', 'all']).describe("Output format. 'docx', 'pdf', 'html' return that single file; 'all' returns a ZIP with all three."),
  pageSize: z.enum(['A3', 'A4', 'Executive', 'US_Legal', 'US_Letter']).default('A4').describe("Page size (defaults to A4)"),
  orientation: z.enum(['Portrait', 'Landscape']).default('Portrait').describe("Page orientation (defaults to Portrait)")
}).refine(
  (data) => {
    const inputCount = [data.content, data.filePath, data.fileContent].filter(Boolean).length;
    return inputCount === 1;
  },
  {
    message: "Exactly one input method must be provided (content, filePath, or fileContent)"
  }
);

// Template listing schema
export const listTemplatesSchema = z.object({
  includeDetails: z.boolean().default(false).describe("Include template details like page sizes and orientations")
});

// Built-in templates schema  
export const listBuiltinTemplatesSchema = z.object({
  includeDetails: z.boolean().default(false).describe("Include template details")
});

// Custom templates schema
export const listCustomTemplatesSchema = z.object({
  includeDetails: z.boolean().default(false).describe("Include template details")
});

// Estimate conversion cost schema
export const estimateConversionCostSchema = z.object({
  content: z.string().describe("Markdown content to estimate credit cost for"),
  templateName: z.string().describe("Template ID or name (UUID for custom templates, name for system templates)"),
  outputFormat: z.enum(['docx', 'pdf', 'html', 'all', 'all-formats']).describe("Output format(s): docx (DOCX only), pdf (DOCX+PDF), html (DOCX+HTML), all/all-formats (DOCX+PDF+HTML)"),
  pageSize: z.enum(['A3', 'A4', 'Executive', 'US_Legal', 'US_Letter']).default('A4').describe("Page size for the document"),
  orientation: z.enum(['Portrait', 'Landscape']).default('Portrait').describe("Page orientation")
});

export type ConvertDocumentInput = z.infer<typeof convertDocumentSchema>;
export type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
export type ListBuiltinTemplatesInput = z.infer<typeof listBuiltinTemplatesSchema>;
export type ListCustomTemplatesInput = z.infer<typeof listCustomTemplatesSchema>;
export type EstimateConversionCostInput = z.infer<typeof estimateConversionCostSchema>;