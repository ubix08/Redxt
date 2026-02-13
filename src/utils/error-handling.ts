/**
 * Enhanced Error Handling & Recovery System
 * Categorizes errors and implements sophisticated retry strategies
 */

import type {
  ErrorCategory,
  ErrorContext,
  RetryStrategy,
  BrowserAction,
} from '../types';

// ============================================================================
// ERROR CATEGORIZATION
// ============================================================================

export function categorizeError(error: Error, context?: any): ErrorCategory {
  const message = error.message.toLowerCase();
  
  // Rate limit errors
  if (message.includes('rate limit') || message.includes('429')) {
    return 'rate_limit';
  }
  
  // Network errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed')
  ) {
    return 'network';
  }
  
  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  
  // User input required
  if (
    message.includes('captcha') ||
    message.includes('verification') ||
    message.includes('login required') ||
    message.includes('authentication')
  ) {
    return 'user_input_required';
  }
  
  // Fatal errors
  if (
    message.includes('forbidden') ||
    message.includes('unauthorized') ||
    message.includes('invalid session') ||
    message.includes('not found') && context?.critical
  ) {
    return 'fatal';
  }
  
  // Default to recoverable
  return 'recoverable';
}

// ============================================================================
// ERROR CONTEXT BUILDER
// ============================================================================

export function buildErrorContext(
  error: Error,
  step: number,
  action?: BrowserAction
): ErrorContext {
  const category = categorizeError(error);
  
  let userActionRequired: string | undefined;
  let suggestedAction: string | undefined;
  
  switch (category) {
    case 'user_input_required':
      userActionRequired = 'Please complete the required verification (CAPTCHA, login, etc.)';
      suggestedAction = 'Pause and wait for user to complete verification';
      break;
      
    case 'rate_limit':
      suggestedAction = 'Wait before retrying (exponential backoff)';
      break;
      
    case 'network':
      suggestedAction = 'Retry with exponential backoff';
      break;
      
    case 'timeout':
      suggestedAction = 'Increase timeout and retry';
      break;
      
    case 'fatal':
      suggestedAction = 'Abort task execution';
      break;
      
    case 'recoverable':
      suggestedAction = 'Retry with backoff';
      break;
  }
  
  return {
    category,
    message: error.message,
    originalError: error,
    step,
    action,
    retryable: category !== 'fatal',
    userActionRequired,
    suggestedAction,
  };
}

// ============================================================================
// RETRY STRATEGY
// ============================================================================

export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableCategories: [
    'recoverable',
    'network',
    'timeout',
    'rate_limit',
  ],
};

export function calculateBackoff(
  attempt: number,
  strategy: RetryStrategy = DEFAULT_RETRY_STRATEGY
): number {
  const backoff = strategy.backoffMs * Math.pow(strategy.backoffMultiplier, attempt - 1);
  return Math.min(backoff, strategy.maxBackoffMs);
}

export function isRetryable(
  errorContext: ErrorContext,
  strategy: RetryStrategy = DEFAULT_RETRY_STRATEGY
): boolean {
  return (
    errorContext.retryable &&
    strategy.retryableCategories.includes(errorContext.category)
  );
}

// ============================================================================
// RETRY EXECUTOR
// ============================================================================

export class RetryExecutor {
  constructor(private strategy: RetryStrategy = DEFAULT_RETRY_STRATEGY) {}
  
  /**
   * Execute an operation with automatic retry
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      operationName: string;
      step: number;
      action?: BrowserAction;
    }
  ): Promise<T> {
    let attempt = 0;
    let lastError: Error | null = null;
    
    while (attempt < this.strategy.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        attempt++;
        
        const errorContext = buildErrorContext(lastError, context.step, context.action);
        
        // Log the error
        console.error(`[${context.operationName}] Attempt ${attempt} failed:`, {
          error: errorContext.message,
          category: errorContext.category,
          step: context.step,
        });
        
        // Check if we should retry
        if (!isRetryable(errorContext, this.strategy)) {
          throw new EnhancedError(
            `Non-retryable error in ${context.operationName}: ${errorContext.message}`,
            errorContext
          );
        }
        
        // Check if we've exhausted retries
        if (attempt >= this.strategy.maxRetries) {
          throw new EnhancedError(
            `Max retries (${this.strategy.maxRetries}) exceeded for ${context.operationName}`,
            errorContext
          );
        }
        
        // Calculate backoff and wait
        const backoffMs = calculateBackoff(attempt, this.strategy);
        console.log(`[${context.operationName}] Waiting ${backoffMs}ms before retry ${attempt + 1}...`);
        
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
    
    // This should never be reached, but TypeScript needs it
    throw new EnhancedError(
      `Unexpected error in retry logic for ${context.operationName}`,
      buildErrorContext(lastError!, context.step, context.action)
    );
  }
  
  /**
   * Execute operation with custom retry conditions
   */
  async executeWithCustomRetry<T>(
    operation: () => Promise<T>,
    options: {
      shouldRetry: (error: Error, attempt: number) => boolean;
      maxAttempts: number;
      getBackoff: (attempt: number) => number;
      onRetry?: (error: Error, attempt: number) => void;
    }
  ): Promise<T> {
    let attempt = 0;
    
    while (attempt < options.maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        attempt++;
        
        const err = error as Error;
        
        if (!options.shouldRetry(err, attempt) || attempt >= options.maxAttempts) {
          throw err;
        }
        
        if (options.onRetry) {
          options.onRetry(err, attempt);
        }
        
        const backoff = options.getBackoff(attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
    
    throw new Error('Unexpected: retry loop completed without result');
  }
}

// ============================================================================
// ENHANCED ERROR CLASS
// ============================================================================

export class EnhancedError extends Error {
  public readonly errorContext: ErrorContext;
  
  constructor(message: string, context: ErrorContext) {
    super(message);
    this.name = 'EnhancedError';
    this.errorContext = context;
  }
  
  isRetryable(): boolean {
    return this.errorContext.retryable;
  }
  
  requiresUserInput(): boolean {
    return this.errorContext.category === 'user_input_required';
  }
  
  isFatal(): boolean {
    return this.errorContext.category === 'fatal';
  }
  
  getCategory(): ErrorCategory {
    return this.errorContext.category;
  }
  
  getSuggestedAction(): string | undefined {
    return this.errorContext.suggestedAction;
  }
}

// ============================================================================
// ERROR RECOVERY STRATEGIES
// ============================================================================

export interface RecoveryAction {
  type: 'retry' | 'pause' | 'skip' | 'abort' | 'ask_user';
  delay?: number;
  message?: string;
}

export function determineRecoveryAction(
  errorContext: ErrorContext,
  currentAttempt: number,
  maxAttempts: number
): RecoveryAction {
  switch (errorContext.category) {
    case 'fatal':
      return {
        type: 'abort',
        message: `Fatal error: ${errorContext.message}`,
      };
      
    case 'user_input_required':
      return {
        type: 'pause',
        message: errorContext.userActionRequired || 'User action required',
      };
      
    case 'rate_limit':
      if (currentAttempt < maxAttempts) {
        return {
          type: 'retry',
          delay: calculateBackoff(currentAttempt, DEFAULT_RETRY_STRATEGY),
          message: 'Rate limit hit, waiting before retry',
        };
      }
      return {
        type: 'abort',
        message: 'Rate limit retry attempts exhausted',
      };
      
    case 'timeout':
      if (currentAttempt < maxAttempts) {
        return {
          type: 'retry',
          delay: calculateBackoff(currentAttempt, DEFAULT_RETRY_STRATEGY),
          message: 'Timeout occurred, retrying with increased timeout',
        };
      }
      return {
        type: 'ask_user',
        message: 'Task is taking longer than expected. Continue?',
      };
      
    case 'network':
      if (currentAttempt < maxAttempts) {
        return {
          type: 'retry',
          delay: calculateBackoff(currentAttempt, DEFAULT_RETRY_STRATEGY),
          message: 'Network error, retrying',
        };
      }
      return {
        type: 'abort',
        message: 'Network error retry attempts exhausted',
      };
      
    case 'recoverable':
      if (currentAttempt < maxAttempts) {
        return {
          type: 'retry',
          delay: calculateBackoff(currentAttempt, DEFAULT_RETRY_STRATEGY),
          message: 'Recoverable error, retrying',
        };
      }
      return {
        type: 'skip',
        message: 'Skipping failed action and continuing',
      };
      
    default:
      return {
        type: 'abort',
        message: `Unknown error category: ${errorContext.category}`,
      };
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

export function formatErrorForUser(errorContext: ErrorContext): string {
  const { category, message, userActionRequired } = errorContext;
  
  let formatted = `Error (${category}): ${message}`;
  
  if (userActionRequired) {
    formatted += `\n\nAction Required: ${userActionRequired}`;
  }
  
  return formatted;
}

export function createErrorReport(
  errorContext: ErrorContext,
  additionalInfo?: Record<string, any>
): Record<string, any> {
  return {
    category: errorContext.category,
    message: errorContext.message,
    retryable: errorContext.retryable,
    step: errorContext.step,
    action: errorContext.action,
    suggestedAction: errorContext.suggestedAction,
    userActionRequired: errorContext.userActionRequired,
    timestamp: Date.now(),
    ...additionalInfo,
  };
}
