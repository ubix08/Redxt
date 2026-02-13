/**
 * Enhanced Tool Registry System
 * Extensible, validated, and secure browser automation tools
 */

import type {
  BrowserTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ValidationResult,
  BrowserAction,
} from '../types';

// ============================================================================
// TOOL REGISTRY
// ============================================================================

export class ToolRegistry {
  private tools = new Map<string, BrowserTool>();
  
  /**
   * Register a new tool
   */
  register(tool: BrowserTool): void {
    this.tools.set(tool.definition.name, tool);
  }
  
  /**
   * Register multiple tools at once
   */
  registerMany(tools: BrowserTool[]): void {
    tools.forEach(tool => this.register(tool));
  }
  
  /**
   * Get a tool by name
   */
  get(name: string): BrowserTool | undefined {
    return this.tools.get(name);
  }
  
  /**
   * Get all registered tools
   */
  getAll(): BrowserTool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Get tool definitions for LLM
   */
  getDefinitionsForLLM(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }
  
  /**
   * Get tools by category
   */
  getByCategory(category: ToolDefinition['category']): BrowserTool[] {
    return this.getAll().filter(tool => tool.definition.category === category);
  }
  
  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
  
  /**
   * Validate tool parameters
   */
  validate(name: string, params: any): ValidationResult {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        isValid: false,
        errors: [`Tool '${name}' not found`],
      };
    }
    
    return tool.validate(params);
  }
  
  /**
   * Execute a tool
   */
  async execute(
    name: string,
    params: any,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`,
        executionTime: Date.now() - startTime,
        browserStateChanged: false,
      };
    }
    
    // Validate parameters
    const validation = tool.validate(params);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors?.join(', ')}`,
        executionTime: Date.now() - startTime,
        browserStateChanged: false,
      };
    }
    
    // Check if tool can be executed in current context
    if (tool.canExecute && !tool.canExecute(context)) {
      return {
        success: false,
        error: `Tool '${name}' cannot be executed in current context`,
        executionTime: Date.now() - startTime,
        browserStateChanged: false,
      };
    }
    
    // Execute the tool
    try {
      const result = await tool.execute(params, context);
      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
        browserStateChanged: false,
      };
    }
  }
}

// ============================================================================
// PARAMETER VALIDATION HELPERS
// ============================================================================

export function validateParams(
  params: any,
  definition: Record<string, any>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required parameters
  for (const [key, param] of Object.entries(definition)) {
    if (param.required && !(key in params)) {
      errors.push(`Missing required parameter: ${key}`);
    }
  }
  
  // Validate parameter types and values
  for (const [key, value] of Object.entries(params)) {
    const param = definition[key];
    if (!param) {
      warnings.push(`Unknown parameter: ${key}`);
      continue;
    }
    
    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (param.type !== actualType && actualType !== 'undefined') {
      errors.push(`Parameter '${key}' should be ${param.type}, got ${actualType}`);
    }
    
    // Enum validation
    if (param.enum && !param.enum.includes(value)) {
      errors.push(`Parameter '${key}' must be one of: ${param.enum.join(', ')}`);
    }
    
    // Custom validation
    if (param.validation && !param.validation(value)) {
      errors.push(`Parameter '${key}' failed custom validation`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// BROWSER TOOLS IMPLEMENTATIONS
// ============================================================================

export const clickTool: BrowserTool = {
  definition: {
    name: 'click',
    description: 'Click an interactive element by its index number',
    parameters: {
      index: {
        type: 'number',
        description: 'The index of the element to click',
        required: true,
        validation: (v) => Number.isInteger(v) && v >= 0,
      },
    },
    category: 'interaction',
    riskLevel: 'low',
  },
  validate: (params) => validateParams(params, {
    index: { type: 'number', required: true, validation: (v: number) => Number.isInteger(v) && v >= 0 },
  }),
  execute: async (params, context) => {
    // This would be sent to the browser extension
    return {
      success: true,
      data: { action: 'click', index: params.index },
      executionTime: 0,
      browserStateChanged: true,
    };
  },
};

export const typeTool: BrowserTool = {
  definition: {
    name: 'type',
    description: 'Type text into an input field',
    parameters: {
      index: {
        type: 'number',
        description: 'The index of the input element',
        required: true,
      },
      text: {
        type: 'string',
        description: 'The text to type',
        required: true,
      },
      pressEnter: {
        type: 'boolean',
        description: 'Whether to press Enter after typing',
        required: false,
        default: false,
      },
    },
    category: 'interaction',
    riskLevel: 'low',
  },
  validate: (params) => validateParams(params, {
    index: { type: 'number', required: true },
    text: { type: 'string', required: true },
    pressEnter: { type: 'boolean', required: false },
  }),
  execute: async (params, context) => {
    return {
      success: true,
      data: { 
        action: 'type', 
        index: params.index, 
        text: params.text,
        pressEnter: params.pressEnter ?? false,
      },
      executionTime: 0,
      browserStateChanged: true,
    };
  },
};

export const navigateTool: BrowserTool = {
  definition: {
    name: 'navigate',
    description: 'Navigate to a URL',
    parameters: {
      url: {
        type: 'string',
        description: 'The URL to navigate to',
        required: true,
        validation: (v) => {
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
      },
    },
    category: 'navigation',
    riskLevel: 'medium',
  },
  validate: (params) => {
    const result = validateParams(params, {
      url: { 
        type: 'string', 
        required: true,
        validation: (v: string) => {
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
    return result;
  },
  execute: async (params, context) => {
    return {
      success: true,
      data: { action: 'navigate', url: params.url },
      executionTime: 0,
      browserStateChanged: true,
    };
  },
};

export const scrollTool: BrowserTool = {
  definition: {
    name: 'scroll',
    description: 'Scroll the page',
    parameters: {
      direction: {
        type: 'string',
        description: 'Direction to scroll',
        required: true,
        enum: ['up', 'down', 'top', 'bottom'],
      },
      amount: {
        type: 'number',
        description: 'Amount to scroll in pixels (for up/down)',
        required: false,
      },
    },
    category: 'navigation',
    riskLevel: 'low',
  },
  validate: (params) => validateParams(params, {
    direction: { 
      type: 'string', 
      required: true,
      enum: ['up', 'down', 'top', 'bottom'],
    },
    amount: { type: 'number', required: false },
  }),
  execute: async (params, context) => {
    return {
      success: true,
      data: { action: 'scroll', direction: params.direction, amount: params.amount },
      executionTime: 0,
      browserStateChanged: true,
    };
  },
};

export const extractTool: BrowserTool = {
  definition: {
    name: 'extract',
    description: 'Extract specific information from the page',
    parameters: {
      selector: {
        type: 'string',
        description: 'CSS selector for elements to extract',
        required: false,
      },
      dataType: {
        type: 'string',
        description: 'Type of data to extract',
        required: true,
        enum: ['text', 'links', 'images', 'table', 'custom'],
      },
    },
    category: 'extraction',
    riskLevel: 'low',
  },
  validate: (params) => validateParams(params, {
    selector: { type: 'string', required: false },
    dataType: { 
      type: 'string', 
      required: true,
      enum: ['text', 'links', 'images', 'table', 'custom'],
    },
  }),
  execute: async (params, context) => {
    return {
      success: true,
      data: { action: 'extract', selector: params.selector, dataType: params.dataType },
      executionTime: 0,
      browserStateChanged: false,
    };
  },
};

export const waitTool: BrowserTool = {
  definition: {
    name: 'wait',
    description: 'Wait for a condition or time period',
    parameters: {
      type: {
        type: 'string',
        description: 'What to wait for',
        required: true,
        enum: ['time', 'element', 'navigation'],
      },
      value: {
        type: 'string',
        description: 'Wait condition value (milliseconds, selector, or url)',
        required: true,
      },
      timeout: {
        type: 'number',
        description: 'Maximum time to wait in milliseconds',
        required: false,
        default: 30000,
      },
    },
    category: 'utility',
    riskLevel: 'low',
  },
  validate: (params) => validateParams(params, {
    type: { 
      type: 'string', 
      required: true,
      enum: ['time', 'element', 'navigation'],
    },
    value: { type: 'string', required: true },
    timeout: { type: 'number', required: false },
  }),
  execute: async (params, context) => {
    return {
      success: true,
      data: { action: 'wait', type: params.type, value: params.value, timeout: params.timeout ?? 30000 },
      executionTime: 0,
      browserStateChanged: false,
    };
  },
};

export const completeTool: BrowserTool = {
  definition: {
    name: 'complete',
    description: 'Mark the task as complete with a result',
    parameters: {
      result: {
        type: 'string',
        description: 'The final result or summary of the task',
        required: true,
      },
      data: {
        type: 'object',
        description: 'Optional structured data extracted during the task',
        required: false,
      },
    },
    category: 'utility',
    riskLevel: 'low',
  },
  validate: (params) => validateParams(params, {
    result: { type: 'string', required: true },
    data: { type: 'object', required: false },
  }),
  execute: async (params, context) => {
    return {
      success: true,
      data: { action: 'complete', result: params.result, extractedData: params.data },
      executionTime: 0,
      browserStateChanged: false,
    };
  },
};

// ============================================================================
// CREATE DEFAULT REGISTRY
// ============================================================================

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  
  registry.registerMany([
    clickTool,
    typeTool,
    navigateTool,
    scrollTool,
    extractTool,
    waitTool,
    completeTool,
  ]);
  
  return registry;
}
