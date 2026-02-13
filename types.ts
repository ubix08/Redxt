/**
 * Enhanced Type Definitions - Complete Implementation
 */

export interface Env {
  SESSIONS: DurableObjectNamespace;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

export interface BrowserState {
  url: string;
  title: string;
  screenshot?: string;
  domTree?: DOMElement[];
  viewport?: {
    width: number;
    height: number;
  };
  timestamp: number;
  tabId?: number;
  tabs?: TabInfo[];
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
}

export interface DOMElement {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
  children?: string[];
  xpath?: string;
  isInteractive?: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export enum ActionType {
  // Navigation
  NAVIGATE = 'navigate',
  GO_BACK = 'go_back',
  
  // Interaction
  CLICK = 'click',
  TYPE = 'type',
  HOVER = 'hover',
  SELECT = 'select',
  
  // Scrolling
  SCROLL = 'scroll',
  SCROLL_TO_TOP = 'scroll_to_top',
  SCROLL_TO_BOTTOM = 'scroll_to_bottom',
  SCROLL_TO_TEXT = 'scroll_to_text',
  SCROLL_TO_PERCENT = 'scroll_to_percent',
  
  // Tab Management
  OPEN_TAB = 'open_tab',
  CLOSE_TAB = 'close_tab',
  SWITCH_TAB = 'switch_tab',
  
  // Page Control
  WAIT = 'wait',
  SCREENSHOT = 'screenshot',
  
  // Data Operations
  EXTRACT = 'extract',
  CACHE_CONTENT = 'cache_content',
  
  // Keyboard
  PRESS_KEY = 'press_key',
  SEND_KEYS = 'send_keys',
  
  // Dropdown
  GET_DROPDOWN_OPTIONS = 'get_dropdown_options',
  
  // Shortcuts
  SEARCH_GOOGLE = 'search_google',
  
  // Pagination
  NEXT_PAGE = 'next_page',
  PREVIOUS_PAGE = 'previous_page',
  
  // Completion
  COMPLETE = 'complete',
}

export interface BaseAction {
  id: string;
  type: ActionType;
  reasoning: string;
  timestamp: number;
}

export interface NavigateAction extends BaseAction {
  type: ActionType.NAVIGATE;
  url: string;
}

export interface GoBackAction extends BaseAction {
  type: ActionType.GO_BACK;
}

export interface ClickAction extends BaseAction {
  type: ActionType.CLICK;
  selector: string;
  elementId?: string;
}

export interface TypeAction extends BaseAction {
  type: ActionType.TYPE;
  selector: string;
  text: string;
  elementId?: string;
  clearFirst?: boolean;
}

export interface HoverAction extends BaseAction {
  type: ActionType.HOVER;
  selector: string;
  elementId?: string;
}

export interface SelectAction extends BaseAction {
  type: ActionType.SELECT;
  selector: string;
  value: string;
  elementId?: string;
}

export interface ScrollAction extends BaseAction {
  type: ActionType.SCROLL;
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface ScrollToTopAction extends BaseAction {
  type: ActionType.SCROLL_TO_TOP;
}

export interface ScrollToBottomAction extends BaseAction {
  type: ActionType.SCROLL_TO_BOTTOM;
}

export interface ScrollToTextAction extends BaseAction {
  type: ActionType.SCROLL_TO_TEXT;
  text: string;
}

export interface ScrollToPercentAction extends BaseAction {
  type: ActionType.SCROLL_TO_PERCENT;
  percent: number;
}

export interface OpenTabAction extends BaseAction {
  type: ActionType.OPEN_TAB;
  url: string;
}

export interface CloseTabAction extends BaseAction {
  type: ActionType.CLOSE_TAB;
  tabId?: number;
}

export interface SwitchTabAction extends BaseAction {
  type: ActionType.SWITCH_TAB;
  tabId: number;
}

export interface WaitAction extends BaseAction {
  type: ActionType.WAIT;
  duration: number;
  reason?: string;
}

export interface ScreenshotAction extends BaseAction {
  type: ActionType.SCREENSHOT;
}

export interface ExtractAction extends BaseAction {
  type: ActionType.EXTRACT;
  selector?: string;
  fields: string[];
  extractionPrompt?: string;
}

export interface CacheContentAction extends BaseAction {
  type: ActionType.CACHE_CONTENT;
  selector?: string;
  cacheKey: string;
}

export interface PressKeyAction extends BaseAction {
  type: ActionType.PRESS_KEY;
  key: string;
  modifiers?: string[];
}

export interface SendKeysAction extends BaseAction {
  type: ActionType.SEND_KEYS;
  keys: string;
}

export interface GetDropdownOptionsAction extends BaseAction {
  type: ActionType.GET_DROPDOWN_OPTIONS;
  selector: string;
}

export interface SearchGoogleAction extends BaseAction {
  type: ActionType.SEARCH_GOOGLE;
  query: string;
}

export interface NextPageAction extends BaseAction {
  type: ActionType.NEXT_PAGE;
}

export interface PreviousPageAction extends BaseAction {
  type: ActionType.PREVIOUS_PAGE;
}

export interface CompleteAction extends BaseAction {
  type: ActionType.COMPLETE;
  result: string;
  success: boolean;
}

export type Action =
  | NavigateAction
  | GoBackAction
  | ClickAction
  | TypeAction
  | HoverAction
  | SelectAction
  | ScrollAction
  | ScrollToTopAction
  | ScrollToBottomAction
  | ScrollToTextAction
  | ScrollToPercentAction
  | OpenTabAction
  | CloseTabAction
  | SwitchTabAction
  | WaitAction
  | ScreenshotAction
  | ExtractAction
  | CacheContentAction
  | PressKeyAction
  | SendKeysAction
  | GetDropdownOptionsAction
  | SearchGoogleAction
  | NextPageAction
  | PreviousPageAction
  | CompleteAction;

export interface ActionResult {
  actionId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  screenshot?: string;
  domState?: unknown;
  timestamp: number;
  extractedData?: unknown;
}

export interface Task {
  id: string;
  description: string;
  startUrl?: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ExecutionState {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  WAITING_FOR_RESULT = 'waiting_for_result',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum AgentType {
  PLANNER = 'planner',
  NAVIGATOR = 'navigator',
  EXTRACTOR = 'extractor',
}

export interface AgentOutput {
  agent: AgentType;
  result: unknown;
  reasoning?: string;
  done?: boolean;
  error?: string;
}

export interface PlannerOutput {
  strategy: string;
  nextSteps: string[];
  done: boolean;
  finalAnswer?: string;
  currentProgress: string;
}

export interface NavigatorOutput {
  actions: Action[];
  done: boolean;
  reasoning: string;
}

export interface ExtractorOutput {
  extractedData: Record<string, unknown>;
  fields: string[];
}

export interface SessionState {
  sessionId: string;
  tasks: Task[];
  currentTaskIndex: number;
  currentAction: Action | null;
  executionState: ExecutionState;
  browserState: BrowserState | null;
  actionHistory: Array<{ action: Action; result: ActionResult }>;
  plannerHistory: PlannerOutput[];
  conversationHistory: LLMMessage[];
  contentCache: Map<string, string>;
  createdAt: number;
  updatedAt: number;
  stepCount: number;
  consecutiveFailures: number;
  config: ExecutionConfig;
}

export interface ExecutionConfig {
  maxSteps: number;
  maxFailures: number;
  planningInterval: number;
  useVision: boolean;
  enableReplay: boolean;
  maxActionsPerStep: number;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  supportsVision?: boolean;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContent[];
}

export type MessageContent = TextContent | ImageContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ExecuteTaskRequest {
  task: string;
  tabId: number;
  url: string;
  apiKey?: string;
  model?: string;
  provider?: 'openai' | 'anthropic';
  config?: Partial<ExecutionConfig>;
}

export interface EventData {
  type: EventType;
  actor: string;
  state: string;
  data?: unknown;
  timestamp: number;
}

export enum EventType {
  TASK_START = 'task_start',
  TASK_OK = 'task_ok',
  TASK_FAIL = 'task_fail',
  TASK_CANCEL = 'task_cancel',
  TASK_PAUSE = 'task_pause',
  PLAN_START = 'plan_start',
  PLAN_OK = 'plan_ok',
  PLAN_FAIL = 'plan_fail',
  ACT_START = 'act_start',
  ACT_OK = 'act_ok',
  ACT_FAIL = 'act_fail',
  STATE_UPDATE = 'state_update',
}

export interface ReplaySession {
  sessionId: string;
  taskDescription: string;
  actions: Array<{ action: Action; result: ActionResult }>;
  createdAt: number;
}
