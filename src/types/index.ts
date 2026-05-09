// Global type definitions for MDMagic MCP Server

export interface AuthConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
}

export interface ConvertDocumentInput {
  content?: string;
  filePath?: string;
  fileContent?: string;
  templateName: string;
  outputFormat: 'docx' | 'pdf' | 'html' | 'all';
  pageSize: 'A3' | 'A4' | 'Executive' | 'US_Legal' | 'US_Letter';
  orientation: 'Portrait' | 'Landscape';
}

export interface ConvertDocumentResponse {
  success: boolean;
  downloadUrl: string;
  expiresAt: string;
  format: string;
  templateUsed: string;
  message?: string;
}

export interface ProcessedContent {
  type: 'text' | 'file' | 'base64';
  content: string;
  size: number;
}

export interface TemplateInfo {
  id: string;
  name: string;
  type: 'built-in' | 'custom';
  description?: string;
  variants: Array<{
    pageSize: string;
    orientation: string;
    fileName: string;
  }>;
}

export interface TemplatesApiResponse {
  templates: TemplateInfo[];
}

export interface ConvertApiRequest {
  content?: string;
  templateId: string;
  outputFormat: 'docx' | 'pdf' | 'html' | 'all' | string[] | string;  // Support multiple formats
  pageSize: string;
  orientation: string;
  expectedCredits?: number;
  fileName?: string;  // Optional output filename basename (no extension)
}

export interface ConvertApiResponse {
  success: boolean;
  downloadUrl: string;
  fileName?: string;
  format: string;
  message: string;
  expiresAt: string;
  creditsUsed?: number;
  sessionId?: string;
  downloadToken?: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  required?: number;
  available?: number;
}