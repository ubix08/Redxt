/**
 * Enhanced Session Durable Object - FIXED
 * Following Cloudflare Workers official pattern
 */

import { DurableObject } from 'cloudflare:workers';
import type {
  SessionState,
  BrowserState,
  BrowserAction,
  Task,
  EventData,
  ReplaySession,
  SessionConfig,
  ActionRecord,
  PlannerRecord,
} from '../types';
import { EnhancedCoordinator } from '../agents/coordinator';
import { createDefaultToolRegistry } from '../tools/registry';
import { EnhancedContentCache } from '../utils/cache';
import { DEFAULT_RETRY_STRATEGY } from '../utils/error-handling';

const DEFAULT_CONFIG: SessionConfig = {
  maxSteps: 50,
  enableVision: true,
  enableReplay: true,
  enableAnalytics: true,
  strictSecurity: true,
  retryStrategy: DEFAULT_RETRY_STRATEGY,
  cacheStrategy: {
    enabled: true,
    maxSize: 100,
    ttl: 300000,
    compressionEnabled: true,
    compressionThreshold: 10000,
    warmingEnabled: false,
  },
  toolsEnabled: ['click', 'type', 'navigate', 'scroll', 'extract', 'wait', 'complete'],
};

export class SessionDurableObject extends DurableObject {
  private sessionState: SessionState | null = null;
  private coordinator: EnhancedCoordinator | null = null;
  private toolRegistry = createDefaultToolRegistry();
  private contentCache: EnhancedContentCache | null = null;
  private actionQueue: BrowserAction[] = [];
  private eventListeners = new Set<(event: EventData) => void>();
  
  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    // Don't do any async work here - just initialization
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    try {
      switch (path) {
        case '/init': return await this.handleInit(request);
        case '/execute': return await this.handleExecute(request);
        case '/follow-up': return await this.handleFollowUp(request);
        case '/next-action': return await this.handleNextAction(request);
        case '/action-result': return await this.handleActionResult(request);
        case '/state': return await this.handleUpdateState(request);
        case '/pause': return await this.handlePause();
        case '/resume': return await this.handleResume();
        case '/cancel': return await this.handleCancel();
        case '/history': return await this.handleGetHistory();
        case '/events': return await this.handleEventStream(request);
        case '/replay': return await this.handleReplay(request);
        case '/extract': return await this.handleExtract(request);
        default: return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('[SessionDO] Error:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
  
  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { extensionId?: string; config?: Partial<SessionConfig> };
    const sessionId = this.ctx.id.toString();
    const config = { ...DEFAULT_CONFIG, ...body.config };
    
    this.sessionState = {
      sessionId,
      extensionId: body.extensionId || '',
      tasks: [],
      currentTaskIndex: -1,
      stepCount: 0,
      executionState: 'idle',
      actionQueue: [],
      actionHistory: [],
      plannerHistory: [],
      securityEvents: [],
      browserState: {
        url: '',
        title: '',
        dom: '',
        viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
        navigation: { canGoBack: false, canGoForward: false },
        timestamp: Date.now(),
      },
      contentCache: new Map(),
      cacheStats: { hits: 0, misses: 0, evictions: 0, totalSize: 0, hitRate: 0 },
      config,
      metrics: {
        totalSteps: 0,
        successfulActions: 0,
        failedActions: 0,
        retriedActions: 0,
        totalExecutionTime: 0,
        averageStepTime: 0,
        llmCalls: 0,
        llmTokensUsed: 0,
        estimatedCost: 0,
        securityThreatsDetected: 0,
        cacheHitRate: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    this.contentCache = new EnhancedContentCache(config.cacheStrategy);
    await this.ctx.storage.put('session', this.serializeState());
    
    return this.jsonResponse({ sessionId });
  }
  
  private async handleExecute(request: Request): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    const body = await request.json() as { task: string; vision?: boolean; apiKey: string };
    
    const task: Task = {
      id: `task-${Date.now()}`,
      description: body.task,
      status: 'running',
      priority: 1,
      createdAt: Date.now(),
      startedAt: Date.now(),
    };
    
    this.sessionState.tasks.push(task);
    this.sessionState.currentTaskIndex = this.sessionState.tasks.length - 1;
    this.sessionState.executionState = 'planning';
    
    this.coordinator = new EnhancedCoordinator(body.apiKey, this.sessionState, this.toolRegistry);
    
    if (body.vision !== undefined) {
      this.sessionState.config.enableVision = body.vision;
    }
    
    await this.saveState();
    
    this.emitEvent({
      type: 'task_start',
      actor: 'system',
      state: 'Task started',
      data: { taskId: task.id, description: task.description },
      timestamp: Date.now(),
    });
    
    // Plan first step (non-blocking)
    this.planNextStep().catch(err => {
      console.error('[SessionDO] Planning error:', err);
      if (this.sessionState) {
        this.sessionState.executionState = 'error';
        const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
        if (currentTask) {
          currentTask.status = 'failed';
          currentTask.error = err.message;
        }
        this.saveState().catch(console.error);
      }
    });
    
    return this.jsonResponse({ success: true, taskId: task.id });
  }
  
  private async planNextStep(): Promise<void> {
    if (!this.sessionState || !this.coordinator) return;
    
    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (!currentTask || 
        this.sessionState.executionState === 'paused' || 
        this.sessionState.executionState === 'completed') {
      return;
    }
    
    if (this.sessionState.stepCount >= this.sessionState.config.maxSteps) {
      currentTask.status = 'failed';
      currentTask.error = 'Maximum steps reached';
      this.sessionState.executionState = 'error';
      await this.saveState();
      return;
    }
    
    this.sessionState.stepCount++;
    this.sessionState.metrics.totalSteps++;
    
    const cacheKey = `${this.sessionState.browserState.url}-dom`;
    const cachedDOM = this.contentCache?.get(cacheKey, 'dom');
    if (cachedDOM) {
      this.sessionState.browserState.dom = cachedDOM;
      this.sessionState.cacheStats.hits++;
    } else {
      this.sessionState.cacheStats.misses++;
    }
    
    if (this.contentCache) {
      this.sessionState.cacheStats = this.contentCache.getStats();
      this.sessionState.metrics.cacheHitRate = this.sessionState.cacheStats.hitRate;
    }
    
    this.sessionState.executionState = 'planning';
    const plannerOutput = await this.coordinator.runPlanner({
      taskDescription: currentTask.description,
      currentState: this.sessionState.browserState,
      actionHistory: this.sessionState.actionHistory,
      currentPlan: this.sessionState.currentPlan,
      stepCount: this.sessionState.stepCount,
      maxSteps: this.sessionState.config.maxSteps,
    });
    
    const plannerRecord: PlannerRecord = {
      input: {
        taskDescription: currentTask.description,
        currentState: this.sessionState.browserState,
        actionHistory: this.sessionState.actionHistory,
        currentPlan: this.sessionState.currentPlan,
        stepCount: this.sessionState.stepCount,
        maxSteps: this.sessionState.config.maxSteps,
      },
      output: plannerOutput,
      timestamp: Date.now(),
      duration: 0,
    };
    this.sessionState.plannerHistory.push(plannerRecord);
    
    if (plannerOutput.plan) {
      this.sessionState.currentPlan = plannerOutput.plan;
    }
    
    this.emitEvent({
      type: 'plan_generated',
      actor: 'planner',
      state: 'Plan generated',
      data: { reasoning: plannerOutput.reasoning, confidence: plannerOutput.confidence },
      timestamp: Date.now(),
    });
    
    if (plannerOutput.taskComplete) {
      currentTask.status = 'completed';
      currentTask.completedAt = Date.now();
      currentTask.result = plannerOutput.result;
      this.sessionState.executionState = 'completed';
      
      this.emitEvent({
        type: 'task_complete',
        actor: 'system',
        state: 'Task completed',
        data: { result: plannerOutput.result },
        timestamp: Date.now(),
      });
    } else {
      this.actionQueue.push(plannerOutput.nextAction);
      this.sessionState.executionState = 'waiting_for_browser';
    }
    
    await this.saveState();
  }
  
  private async handleFollowUp(request: Request): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    const body = await request.json() as { task: string };
    const task: Task = {
      id: `task-${Date.now()}`,
      description: body.task,
      status: 'pending',
      priority: this.sessionState.tasks.length + 1,
      createdAt: Date.now(),
    };
    
    this.sessionState.tasks.push(task);
    await this.saveState();
    
    return this.jsonResponse({ success: true, taskId: task.id });
  }
  
  private async handleNextAction(request: Request): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    const action = this.actionQueue.shift();
    
    if (!action) {
      return this.jsonResponse({
        waiting: true,
        taskComplete: this.sessionState.executionState === 'completed',
      });
    }
    
    return this.jsonResponse({ action, waiting: false, taskComplete: false });
  }
  
  private async handleActionResult(request: Request): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    const body = await request.json() as {
      success: boolean;
      result?: any;
      error?: string;
      screenshot?: string;
    };
    
    const actionRecord: ActionRecord = {
      action: this.actionQueue[0] || { type: 'unknown', params: {} },
      result: {
        success: body.success,
        data: body.result,
        error: body.error,
        executionTime: 0,
        browserStateChanged: true,
        screenshot: body.screenshot,
      },
      timestamp: Date.now(),
      duration: 0,
      step: this.sessionState.stepCount,
    };
    
    this.sessionState.actionHistory.push(actionRecord);
    
    if (body.success) {
      this.sessionState.metrics.successfulActions++;
    } else {
      this.sessionState.metrics.failedActions++;
    }
    
    if (this.sessionState.executionState === 'waiting_for_browser') {
      this.sessionState.executionState = 'executing';
      
      this.planNextStep().catch(err => {
        console.error('[SessionDO] Planning error:', err);
      });
    }
    
    this.emitEvent({
      type: 'action_executed',
      actor: 'actor',
      state: body.success ? 'Action succeeded' : 'Action failed',
      data: { action: actionRecord.action, success: body.success, error: body.error },
      timestamp: Date.now(),
      severity: body.success ? 'info' : 'warning',
    });
    
    await this.saveState();
    return this.jsonResponse({ success: true });
  }
  
  private async handleUpdateState(request: Request): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    const body = await request.json() as BrowserState;
    
    if (this.contentCache && body.url !== this.sessionState.browserState.url) {
      this.contentCache.onNavigate(body.url, this.sessionState.browserState.url);
    }
    
    this.sessionState.browserState = { ...body, timestamp: Date.now() };
    
    if (this.contentCache && body.dom) {
      this.contentCache.set(`${body.url}-dom`, body.dom, 'dom');
    }
    
    if (this.contentCache && body.screenshot) {
      this.contentCache.set(`${body.url}-screenshot`, body.screenshot, 'screenshot');
    }
    
    this.sessionState.updatedAt = Date.now();
    await this.saveState();
    
    this.emitEvent({
      type: 'state_update',
      actor: 'system',
      state: body.url,
      data: { url: body.url, title: body.title },
      timestamp: Date.now(),
    });
    
    return this.jsonResponse({ success: true });
  }
  
  private async handlePause(): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    this.sessionState.executionState = 'paused';
    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (currentTask) currentTask.status = 'paused';
    this.sessionState.updatedAt = Date.now();
    await this.saveState();
    
    this.emitEvent({
      type: 'task_pause',
      actor: 'system',
      state: 'Task paused',
      timestamp: Date.now(),
    });
    
    return this.jsonResponse({ success: true });
  }
  
  private async handleResume(): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    if (this.sessionState.executionState === 'paused') {
      this.sessionState.executionState = 'planning';
      const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
      if (currentTask) currentTask.status = 'running';
      this.sessionState.updatedAt = Date.now();
      await this.saveState();
      
      this.planNextStep().catch(err => {
        console.error('[SessionDO] Planning error:', err);
      });
      
      this.emitEvent({
        type: 'task_resume',
        actor: 'system',
        state: 'Task resumed',
        timestamp: Date.now(),
      });
    }
    
    return this.jsonResponse({ success: true });
  }
  
  private async handleCancel(): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    this.sessionState.executionState = 'completed';
    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (currentTask) {
      currentTask.status = 'cancelled';
      currentTask.completedAt = Date.now();
    }
    this.sessionState.updatedAt = Date.now();
    this.actionQueue = [];
    await this.saveState();
    
    this.emitEvent({
      type: 'task_cancel',
      actor: 'system',
      state: 'Task cancelled',
      timestamp: Date.now(),
    });
    
    return this.jsonResponse({ success: true });
  }
  
  private async handleGetHistory(): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    return this.jsonResponse({
      sessionId: this.sessionState.sessionId,
      tasks: this.sessionState.tasks,
      currentTaskIndex: this.sessionState.currentTaskIndex,
      executionState: this.sessionState.executionState,
      actionHistory: this.sessionState.actionHistory,
      plannerHistory: this.sessionState.plannerHistory,
      securityEvents: this.sessionState.securityEvents,
      metrics: this.sessionState.metrics,
      stepCount: this.sessionState.stepCount,
    });
  }
  
  private async handleReplay(request: Request): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState || !this.sessionState.config.enableReplay) {
      return this.errorResponse('Replay not enabled', 400);
    }
    
    const replaySession: ReplaySession = {
      sessionId: this.sessionState.sessionId,
      taskDescription: this.sessionState.tasks[0]?.description || '',
      actions: this.sessionState.actionHistory,
      finalState: this.sessionState.browserState,
      metrics: this.sessionState.metrics,
      createdAt: Date.now(),
    };
    
    await this.ctx.storage.put(`replay-${this.sessionState.sessionId}`, replaySession);
    
    return this.jsonResponse({ success: true, replayId: this.sessionState.sessionId });
  }
  
  private async handleExtract(request: Request): Promise<Response> {
    await this.loadState();
    
    if (!this.sessionState || !this.coordinator) {
      return this.errorResponse('Session not initialized', 400);
    }
    
    const body = await request.json() as {
      fields: string[];
      content: string;
      extractionPrompt?: string;
    };
    
    const extractOutput = await this.coordinator.runExtractor(body);
    
    if (extractOutput.error) {
      return this.errorResponse(extractOutput.error, 500);
    }
    
    return this.jsonResponse({
      success: true,
      data: extractOutput.result?.extractedData,
      confidence: extractOutput.result?.confidence,
    });
  }
  
  private async handleEventStream(request: Request): Promise<Response> {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    
    const listener = (event: EventData) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      writer.write(encoder.encode(data)).catch(() => {
        this.eventListeners.delete(listener);
      });
    };
    
    this.eventListeners.add(listener);
    
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
  
  private emitEvent(event: EventData): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[SessionDO] Error emitting event:', error);
      }
    }
  }
  
  private async loadState(): Promise<void> {
    if (this.sessionState) return;
    
    const stored = await this.ctx.storage.get<any>('session');
    if (stored) {
      this.sessionState = {
        ...stored,
        contentCache: new Map(Object.entries(stored.contentCache || {})),
      };
      
      if (this.sessionState.config?.cacheStrategy) {
        this.contentCache = new EnhancedContentCache(this.sessionState.config.cacheStrategy);
      }
    }
  }
  
  private async saveState(): Promise<void> {
    if (this.sessionState) {
      await this.ctx.storage.put('session', this.serializeState());
    }
  }
  
  private serializeState(): any {
    if (!this.sessionState) return null;
    return {
      ...this.sessionState,
      contentCache: Object.fromEntries(this.sessionState.contentCache),
    };
  }
  
  private jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  private errorResponse(message: string, status: number): Response {
    return this.jsonResponse({ error: message }, status);
  }
}
