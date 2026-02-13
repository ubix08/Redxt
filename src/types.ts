/**
 * Enhanced Browser Agent - Type Definitions
 * Complete type system for the enhanced implementation
 */

export interface Env {
  SESSIONS: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT?: string;
  MAX_STEPS?: string;
  ENABLE_ANALYTICS?: string;
}

// ============================================================================
// CORE TYPES
// ============================================================================

export enum ExecutionState {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  WAITING_FOR_BROWSER = 'waiting_for_browser',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum EventType {
  TASK_START = 'task_start',
  TASK_PAUSE = 'task_pause',
  TASK_RESUME = 'task_resume',
  TASK_CANCEL = 'task_cancel',
  TASK_COMPLETE = 'task_complete',
  TASK_ERROR = 'task_error',
  PLAN_GENERATED = 'plan_generated',
  ACTION_EXECUTED = 'action_executed',
  STATE_UPDATE = 'state_update',
  SECURITY_ALERT = 'security_alert',
  PERFORMANCE_METRIC = 'performance_metric',
}

// ============================================================================
// SECURITY & GUARDRAILS
// ============================================================================

export enum ThreatType {
  TASK_OVERRIDE = 'task_override',
  PROMPT_INJECTION = 'prompt_injection',
  SENSITIVE_DATA = 'sensitive_data',
  DANGEROUS_ACTION = 'dangerous_action',
  SYSTEM_REFERENCE = 'system_reference',
  CREDENTIAL_LEAK = 'credential_leak',
}

export interface SecurityPattern {
  pattern: RegExp;
  type: ThreatType;
  description: string;
  replacement?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SanitizationResult {
  sanitized: string;
  threats: ThreatType[];
  modified: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityEvent {
  type: ThreatType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  content: string;
  sessionId: string;
  step: number;
  timestamp: number;
  blocked: boolean;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export enum ErrorCategory {
  RECOVERABLE = 'recoverable',
  USER_INPUT_REQUIRED = 'user_input_required',
  FATAL = 'fatal',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network',
}

export interface ErrorContext {
  category: ErrorCategory;
  message: string;
  originalError: Error;
  step: number;
  action?: BrowserAction;
  retryable: boolean;
  userActionRequired?: string;
  suggestedAction?: string;
}

export interface RetryStrategy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableCategories: ErrorCategory[];
}

// ============================================================================
// TOOLS SYSTEM
// ============================================================================

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
  default?: any;
  validation?: (value: any) => boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  category: 'navigation' | 'interaction' | 'extraction' | 'analysis' | 'utility';
  requiresVision?: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ToolExecutionContext {
  sessionId: string;
  browserState: BrowserState;
  currentStep: number;
  history: ActionRecord[];
  config: SessionConfig;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  browserStateChanged: boolean;
  screenshot?: string;
}

export interface BrowserTool {
  definition: ToolDefinition;
  validate: (params: any) => ValidationResult;
  execute: (params: any, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
  canExecute?: (context: ToolExecutionContext) => boolean;
}

// ============================================================================
// BROWSER STATE & ACTIONS
// ============================================================================

export interface BrowserState {
  url: string;
  title: string;
  dom: string;
  screenshot?: string;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
  navigation: {
    canGoBack: boolean;
    canGoForward: boolean;
  };
  performance?: {
    loadTime: number;
    domContentLoaded: number;
    memoryUsage?: number;
  };
  timestamp: number;
}

export interface BrowserAction {
  type: string;
  params: Record<string, any>;
  reasoning?: string;
  alternatives?: BrowserAction[];
  riskLevel?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
}

export interface ActionRecord {
  action: BrowserAction;
  result: ToolExecutionResult;
  timestamp: number;
  duration: number;
  step: number;
}

// ============================================================================
// TASK & SESSION MANAGEMENT
// ============================================================================

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

export interface SessionConfig {
  maxSteps: number;
  enableVision: boolean;
  enableReplay: boolean;
  enableAnalytics: boolean;
  strictSecurity: boolean;
  retryStrategy: RetryStrategy;
  cacheStrategy: CacheStrategy;
  toolsEnabled: string[];
}

export interface SessionState {
  sessionId: string;
  extensionId: string;
  
  // Task management
  tasks: Task[];
  currentTaskIndex: number;
  stepCount: number;
  
  // Execution state
  executionState: ExecutionState;
  actionQueue: BrowserAction[];
  
  // Strategic planning
  currentPlan?: StrategicPlan;
  
  // History & replay
  actionHistory: ActionRecord[];
  plannerHistory: PlannerRecord[];
  securityEvents: SecurityEvent[];
  
  // Browser state
  browserState: BrowserState;
  
  // Performance & caching
  contentCache: Map<string, CachedContent>;
  cacheStats: CacheStats;
  
  // Configuration
  config: SessionConfig;
  
  // Metrics
  metrics: SessionMetrics;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// PLANNING & COORDINATION
// ============================================================================

export interface StrategicPlan {
  strategy: string;
  estimatedSteps: number;
  confidence: number;
  
  plannedActions: Array<{
    action: BrowserAction;
    reasoning: string;
    alternatives?: BrowserAction[];
    contingency?: string;
    priority: number;
  }>;
  
  successCriteria: string[];
  
  risks: Array<{
    description: string;
    likelihood: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
  
  createdAt: number;
  revisedAt?: number;
  revisionReason?: string;
}

export interface PlannerInput {
  taskDescription: string;
  currentState: BrowserState;
  actionHistory: ActionRecord[];
  currentPlan?: StrategicPlan;
  stepCount: number;
  maxSteps: number;
}

export interface PlannerOutput {
  plan?: StrategicPlan;
  nextAction: BrowserAction;
  reasoning: string;
  confidence: number;
  needsRevision: boolean;
  taskComplete: boolean;
  result?: string;
}

export interface PlannerRecord {
  input: PlannerInput;
  output: PlannerOutput;
  timestamp: number;
  duration: number;
}

export interface ActorInput {
  action: BrowserAction;
  browserState: BrowserState;
  plan?: StrategicPlan;
}

export interface ActorOutput {
  success: boolean;
  result?: any;
  error?: string;
  needsRetry: boolean;
  browserStateChanged: boolean;
  screenshot?: string;
  taskComplete: boolean;
  completionResult?: string;
}

export interface ExtractorInput {
  fields: string[];
  content: string;
  extractionPrompt?: string;
}

export interface ExtractorOutput {
  extractedData: Record<string, any>;
  confidence: number;
  warnings?: string[];
}

// ============================================================================
// CACHING
// ============================================================================

export interface CacheStrategy {
  enabled: boolean;
  maxSize: number;
  ttl: number;
  compressionEnabled: boolean;
  compressionThreshold: number;
  warmingEnabled: boolean;
}

export interface CachedContent {
  content: string;
  compressed: boolean;
  timestamp: number;
  hits: number;
  size: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalSize: number;
  hitRate: number;
}

// ============================================================================
// ANALYTICS & METRICS
// ============================================================================

export interface SessionMetrics {
  totalSteps: number;
  successfulActions: number;
  failedActions: number;
  retriedActions: number;
  totalExecutionTime: number;
  averageStepTime: number;
  llmCalls: number;
  llmTokensUsed: number;
  estimatedCost: number;
  securityThreatsDetected: number;
  cacheHitRate: number;
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// EVENTS
// ============================================================================

export interface EventData {
  type: EventType;
  actor: 'system' | 'planner' | 'actor' | 'user';
  state: string;
  data?: any;
  timestamp: number;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

// ============================================================================
// REPLAY
// ============================================================================

export interface ReplaySession {
  sessionId: string;
  taskDescription: string;
  actions: ActionRecord[];
  finalState: BrowserState;
  metrics: SessionMetrics;
  createdAt: number;
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  threats?: ThreatType[];
  message?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateSessionRequest {
  extensionId?: string;
  config?: Partial<SessionConfig>;
}

export interface CreateSessionResponse {
  sessionId: string;
  durableObjectId: string;
}

export interface ExecuteTaskRequest {
  task: string;
  vision?: boolean;
  strictSecurity?: boolean;
}

export interface ExecuteTaskResponse {
  success: boolean;
  result?: string;
  error?: string;
  metrics?: SessionMetrics;
}

export interface FollowUpTaskRequest {
  task: string;
}

export interface NextActionResponse {
  action?: BrowserAction;
  waiting: boolean;
  taskComplete: boolean;
  result?: string;
}

export interface ActionResultRequest {
  success: boolean;
  result?: any;
  error?: string;
  screenshot?: string;
}

export interface UpdateStateRequest {
  url: string;
  title: string;
  dom: string;
  screenshot?: string;
  viewport: BrowserState['viewport'];
  navigation: BrowserState['navigation'];
  performance?: BrowserState['performance'];
}

export interface ExtractRequest {
  fields: string[];
  content: string;
  extractionPrompt?: string;
}

export interface ExtractResponse {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}
