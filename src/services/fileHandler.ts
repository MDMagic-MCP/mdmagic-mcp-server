// File handling service for multiple input types
import fs from 'fs-extra';
import { ProcessedContent } from '../types/index.js';
import { MCPError } from '../utils/errorHandler.js';

export class TextContentHandler {
  static process(content: string): ProcessedContent {
    if (!content || content.trim().length === 0) {
      throw new MCPError('❌ Content cannot be empty', 'EMPTY_CONTENT');
    }

    return {
      type: 'text',
      content: content.trim(),
      size: Buffer.byteLength(content, 'utf8')
    };
  }
}

export class FilePathHandler {
  static async process(filePath: string): Promise<ProcessedContent> {
    try {
      // Validate file exists and is readable
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        throw new MCPError(`❌ Path is not a file: ${filePath}`, 'INVALID_FILE_PATH');
      }

      // Check file size (reasonable limit for markdown files)
      if (stats.size > 10 * 1024 * 1024) { // 10MB limit
        throw new MCPError(`❌ File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`, 'FILE_TOO_LARGE');
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      
      if (content.trim().length === 0) {
        throw new MCPError(`❌ File is empty: ${filePath}`, 'EMPTY_FILE');
      }

      return {
        type: 'file',
        content: content.trim(),
        size: stats.size
      };
    } catch (error: any) {
      if (error instanceof MCPError) {
        throw error;
      }
      
      if (error.code === 'ENOENT') {
        throw new MCPError(`❌ File not found: ${filePath}`, 'FILE_NOT_FOUND');
      } else if (error.code === 'EACCES') {
        throw new MCPError(`❌ Permission denied: ${filePath}`, 'PERMISSION_DENIED');
      } else {
        throw new MCPError(`❌ Error reading file: ${error.message}`, 'FILE_READ_ERROR');
      }
    }
  }
}

export class Base64ContentHandler {
  static process(base64Content: string): ProcessedContent {
    try {
      // Decode base64 content
      const buffer = Buffer.from(base64Content, 'base64');
      const content = buffer.toString('utf8');
      
      if (content.trim().length === 0) {
        throw new MCPError('❌ Decoded content is empty', 'EMPTY_DECODED_CONTENT');
      }

      // Basic validation that it looks like text/markdown
      if (buffer.length > 10 * 1024 * 1024) { // 10MB limit
        throw new MCPError(`❌ Content too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 10MB)`, 'CONTENT_TOO_LARGE');
      }

      return {
        type: 'base64',
        content: content.trim(),
        size: buffer.length
      };
    } catch (error: any) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(`❌ Invalid base64 content: ${error.message}`, 'INVALID_BASE64');
    }
  }
}

export class FileProcessor {
  async processInput(input: {
    content?: string;
    filePath?: string;
    fileContent?: string;
  }): Promise<ProcessedContent> {
    const inputCount = [input.content, input.filePath, input.fileContent]
      .filter(Boolean).length;
    
    if (inputCount !== 1) {
      throw new MCPError('❌ Exactly one input method must be provided (content, filePath, or fileContent)', 'INVALID_INPUT_COUNT');
    }

    if (input.content) {
      return TextContentHandler.process(input.content);
    } else if (input.filePath) {
      return await FilePathHandler.process(input.filePath);
    } else if (input.fileContent) {
      return Base64ContentHandler.process(input.fileContent);
    }

    throw new MCPError('❌ No valid input provided', 'NO_INPUT');
  }
}