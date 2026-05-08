// MDMagic API client service - SECURE DOWNLOAD URL IMPLEMENTATION
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { AuthManager } from './authManager.js';
import { handleApiError } from '../utils/errorHandler.js';
import {
  ConvertApiRequest,
  ConvertApiResponse,
  TemplatesApiResponse,
  ProcessedContent
} from '../types/index.js';

export class MDMagicApiClient {
  private _client: AxiosInstance;
  private authManager: AuthManager;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
    
    this._client = axios.create({
      baseURL: this.authManager.getBaseUrl(),
      timeout: this.authManager.getTimeout(),
      headers: this.authManager.getAuthHeaders()
    });

    // Add request interceptor for logging
    this._client.interceptors.request.use(
      (config) => {
        console.error(`[MDMagic API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  // Expose the axios client for credit calculator
  get client(): AxiosInstance {
    return this._client;
  }

  async convertDocument(request: ConvertApiRequest): Promise<ConvertApiResponse> {
    try {
      // Process content if provided
      if (!request.content) {
        throw new Error('Content is required for conversion');
      }

      // Prepare the API payload
      const payload = {
        content: request.content,
        templateId: request.templateId,
        pageSize: request.pageSize,
        orientation: request.orientation,
        outputFormats: Array.isArray(request.outputFormat) ? request.outputFormat : [request.outputFormat],  // Support both single format and array
        markdownType: 'commonmark',
        userApiKey: this.authManager.getConfig().apiKey,  // For security
        expectedCredits: request.expectedCredits  // Send calculated credits to API
      };

      console.error(`[convertDocument] Calling API with format: ${Array.isArray(request.outputFormat) ? request.outputFormat.join(', ') : request.outputFormat}`);

      // Call MDMagic API - expect secure download URL in response
      const response: AxiosResponse<any> = await this._client.post('/api/convert', payload);

      console.error(`[convertDocument] API response:`, response.data);
      console.error('[DEBUG] Complete API response:', JSON.stringify(response.data, null, 2));

      // API should return: { downloadUrl, expiresAt, creditsUsed, fileName, sessionId, downloadToken }
      const outputFormat = Array.isArray(request.outputFormat) ? request.outputFormat[0] : request.outputFormat;
      return {
        success: true,
        downloadUrl: response.data.downloadUrl,
        fileName: response.data.fileName || `document.${outputFormat}`,
        format: outputFormat,
        message: `Document converted successfully!`,
        expiresAt: response.data.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        creditsUsed: response.data.creditsUsed,
        sessionId: response.data.sessionId,
        downloadToken: response.data.downloadToken
      };

    } catch (error) {
      console.error('[convertDocument] API Error:', error);
      throw handleApiError(error);
    }
  }

  async getTemplates(): Promise<TemplatesApiResponse> {
    const response: AxiosResponse<TemplatesApiResponse> = await this._client.get('/api/templates');
    return response.data;
  }

  async getUserDefaults(): Promise<{ default_page_size: string; default_orientation: string }> {
    const response: AxiosResponse = await this._client.get('/api/auth/user-info');
    return {
      default_page_size: response.data.user?.default_page_size || 'A4',
      default_orientation: response.data.user?.default_orientation || 'Portrait'
    };
  }

  async getCustomTemplates(): Promise<TemplatesApiResponse> {
    const response: AxiosResponse<TemplatesApiResponse> = await this._client.get('/api/templates/custom');
    return response.data;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this._client.get('/health');
      return true;
    } catch (error) {
      return false;
    }
  }

  getBaseUrl(): string {
    return this.authManager.getBaseUrl();
  }
}