// Enhanced error handling for MDMagic MCP Server

export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export function handleApiError(error: any): MCPError {
  if (error.response) {
    // API returned error response
    const status = error.response.status;
    const data = error.response.data;
    const message = data?.message || 'API request failed';
    const errorType = data?.error || 'Unknown Error';
    
    switch (status) {
      case 401:
        // Handle exact backend authentication error responses
        if (message === 'API key required') {
          return new MCPError(`❌ Missing API key. Set MDMAGIC_API_KEY environment variable.

💡 To fix:
1. Get your API key from your MDMagic dashboard
2. Set: export MDMAGIC_API_KEY="mdmagic-xxxxxxxxxxxxxxxx"
3. Restart your MCP client`, 'MISSING_API_KEY', 401);
        } else if (message === 'Invalid API key format') {
          return new MCPError(`❌ Invalid API key format. Expected: mdmagic-xxxxxxxxxxxxxxxx (exactly 16 digits)

💡 Check your API key format from your MDMagic dashboard`, 'INVALID_API_KEY_FORMAT', 401);
        } else if (message === 'Invalid API key') {
          return new MCPError(`❌ API key not found in database. Please check your key.

💡 Verify your API key in your MDMagic dashboard`, 'AUTHENTICATION_FAILED', 401);
        } else {
          return new MCPError(`❌ Authentication failed: ${message}`, 'AUTHENTICATION_FAILED', 401);
        }
      case 403:
        if (errorType === 'Insufficient Credits') {
          // Extract exact credit information from backend response
          const required = data?.required || 1;
          const available = data?.available || 0;
          return new MCPError(`❌ Insufficient credits for conversion.
Required: ${required}, Available: ${available}

💡 Add more credits in your MDMagic dashboard`, 'INSUFFICIENT_CREDITS', 403);
        }
        return new MCPError(`❌ Access denied: ${message}`, 'ACCESS_DENIED', 403);
      case 429:
        return new MCPError(`❌ Rate limit exceeded. Please wait before trying again.

💡 Consider upgrading your plan for higher limits`, 'RATE_LIMITED', 429);
      case 500:
        if (message === 'Authentication service unavailable') {
          return new MCPError('❌ Authentication service temporarily unavailable. Please try again.', 'SERVICE_UNAVAILABLE', 500);
        }
        return new MCPError(`❌ Server error: ${message}`, 'SERVER_ERROR', status);
      default:
        return new MCPError(`❌ API error: ${message}`, 'API_ERROR', status);
    }
  } else if (error.request) {
    // Network error
    return new MCPError(`❌ Network request failed. Check your internet connection.

💡 Verify API URL: ${process.env.MDMAGIC_BASE_URL || 'https://api.mdmagic.ai'}`, 'NETWORK_ERROR');
  } else {
    // Other error
    return new MCPError(error.message || 'Unknown error', 'UNKNOWN_ERROR');
  }
}

export function validateInput(input: any, fieldName: string): void {
  if (!input) {
    throw new MCPError(`❌ ${fieldName} is required`, 'VALIDATION_ERROR');
  }
}