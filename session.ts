/**
 * Enhanced Session Durable Object - Complete Implementation
 */

import type {
  SessionState,
  Task,
  Action,
  ActionResult,
  ExecutionState as ExecState,
  BrowserState,
  LLMConfig,
  ExecuteTaskRequest,
  ExecutionConfig,
  EventData,
  EventType,
  ReplaySession,
  ExtractorOutput,
} from '../types';
import { TaskStatus, ExecutionState, AgentType } from '../types';
import { MultiAgentCoordinator } from '../agent/multi-agent';
import { corsHeaders } from '../utils/http';
import { generateId } from '../utils/helpers';

const DEFAULT_CONFIG: ExecutionConfig = {
  maxSteps: 50,
  maxFailures: 3,
  planningInterval: 3,
  useVision: true,
  enableReplay: true,
  maxActionsPerStep: 3,
};

export class SessionDurableObject {
  private state: DurableObjectState;
  private sessionState: SessionState | null = null;
  private coordinator: MultiAgentCoordinator | null = null;
  private actionQueue: Action[] = [];
  private eventListeners: Set<(event: EventData) => void> = new Set();
  private executionPromise: Promise<void> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<SessionState>('session');
      if (stored) {
        this.sessionState = stored;
        // Restore content cache as Map
        this.sessionState.contentCache = new Map(
          Object.entries(stored.contentCache || {})
        );
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Initialize session
      if (path === '/init' && request.method === 'POST') {
        return await this.handleInit(request);
      }

      // Execute task
      if (path === '/execute' && request.method === 'POST') {
        return await this.handleExecute(request);
      }

      // Add follow-up task
      if (path === '/follow-up' && request.method === 'POST') {
        return await this.handleFollowUp(request);
      }

      // Get next action
      if (path === '/next-action' && request.method === 'GET') {
        return await this.handleGetNextAction();
      }

      // Report action result
      if (path === '/action-result' && request.method === 'POST') {
        return await this.handleActionResult(request);
      }

      // Update browser state
      if (path === '/state' && request.method === 'POST') {
        return await this.handleUpdateState(request);
      }

      // Pause/Resume/Cancel
      if (path === '/pause' && request.method === 'POST') {
        return await this.handlePause();
      }

      if (path === '/resume' && request.method === 'POST') {
        return await this.handleResume();
      }

      if (path === '/cancel' && request.method === 'POST') {
        return await this.handleCancel();
      }

      // Get history
      if (path === '/history' && request.method === 'GET') {
        return await this.handleGetHistory();
      }

      // Get events (SSE)
      if (path === '/events' && request.method === 'GET') {
        return await this.handleEventStream(request);
      }

      // Replay session
      if (path === '/replay' && request.method === 'POST') {
        return await this.handleReplay(request);
      }

      // Extract data (using extractor agent)
      if (path === '/extract' && request.method === 'POST') {
        return await this.handleExtract(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error in SessionDurableObject:', error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as { extensionId?: string };
    const sessionId = generateId();

    this.sessionState = {
      sessionId,
      tasks: [],
      currentTaskIndex: -1,
      currentAction: null,
      executionState: ExecutionState.IDLE,
      browserState: null,
      actionHistory: [],
      plannerHistory: [],
      conversationHistory: [],
      contentCache: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepCount: 0,
      consecutiveFailures: 0,
      config: DEFAULT_CONFIG,
    };

    await this.persistState();

    return new Response(
      JSON.stringify({ sessionId }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleExecute(request: Request): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const body = await request.json() as ExecuteTaskRequest;

    // Create task
    const task: Task = {
      id: generateId(),
      description: body.task,
      startUrl: body.url,
      status: TaskStatus.RUNNING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessionState.tasks.push(task);
    this.sessionState.currentTaskIndex = this.sessionState.tasks.length - 1;
    this.sessionState.executionState = ExecutionState.PLANNING;
    this.sessionState.updatedAt = Date.now();

    // Merge config
    if (body.config) {
      this.sessionState.config = {
        ...this.sessionState.config,
        ...body.config,
      };
    }

    // Initialize multi-agent coordinator
    const llmConfig: LLMConfig = {
      provider: body.provider || 'openai',
      model: body.model || 'gpt-4o',
      apiKey: body.apiKey || '',
      temperature: 0.7,
      maxTokens: 4000,
    };

    this.coordinator = new MultiAgentCoordinator({
      plannerConfig: llmConfig,
      navigatorConfig: llmConfig,
      extractorConfig: llmConfig,
      options: {
        maxActionsPerStep: this.sessionState.config.maxActionsPerStep,
        useVision: this.sessionState.config.useVision,
      },
    });

    await this.persistState();

    // Start execution (don't await - it runs in background)
    this.executionPromise = this.executeTask();

    // Emit task start event
    this.emitEvent({
      type: 'task_start' as EventType,
      actor: 'system',
      state: task.id,
      data: { task: task.description },
      timestamp: Date.now(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        taskId: task.id,
        sessionId: this.sessionState.sessionId,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleFollowUp(request: Request): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const body = await request.json() as { task: string };

    // Create follow-up task
    const task: Task = {
      id: generateId(),
      description: body.task,
      status: TaskStatus.RUNNING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessionState.tasks.push(task);
    this.sessionState.currentTaskIndex = this.sessionState.tasks.length - 1;
    this.sessionState.executionState = ExecutionState.PLANNING;
    this.sessionState.updatedAt = Date.now();

    await this.persistState();

    // Continue execution if not already running
    if (!this.executionPromise) {
      this.executionPromise = this.executeTask();
    }

    return new Response(
      JSON.stringify({
        success: true,
        taskId: task.id,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async executeTask(): Promise<void> {
    if (!this.sessionState || !this.coordinator) {
      return;
    }

    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (!currentTask) {
      return;
    }

    try {
      let step = 0;
      const maxSteps = this.sessionState.config.maxSteps;

      while (step < maxSteps) {
        // Check if paused or stopped
        if (this.sessionState.executionState === ExecutionState.PAUSED) {
          return;
        }
        if (this.sessionState.executionState === ExecutionState.COMPLETED ||
            this.sessionState.executionState === ExecutionState.FAILED) {
          return;
        }

        // Run planner periodically
        if (step % this.sessionState.config.planningInterval === 0) {
          await this.runPlanner();

          // Check if task is complete
          const lastPlan = this.coordinator.getLastPlan();
          if (lastPlan?.done) {
            this.sessionState.executionState = ExecutionState.COMPLETED;
            currentTask.status = TaskStatus.COMPLETED;
            currentTask.completedAt = Date.now();
            await this.persistState();

            this.emitEvent({
              type: 'task_ok' as EventType,
              actor: 'system',
              state: lastPlan.finalAnswer || 'Task completed',
              timestamp: Date.now(),
            });

            return;
          }
        }

        // Generate and queue actions
        await this.runNavigator();

        step++;
        this.sessionState.stepCount = step;
        await this.persistState();
      }

      // Max steps reached
      this.sessionState.executionState = ExecutionState.FAILED;
      currentTask.status = TaskStatus.FAILED;
      currentTask.completedAt = Date.now();
      await this.persistState();

      this.emitEvent({
        type: 'task_fail' as EventType,
        actor: 'system',
        state: 'Max steps reached',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Execution error:', error);
      this.sessionState.executionState = ExecutionState.FAILED;
      currentTask.status = TaskStatus.FAILED;
      currentTask.completedAt = Date.now();
      await this.persistState();

      this.emitEvent({
        type: 'task_fail' as EventType,
        actor: 'system',
        state: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async runPlanner(): Promise<void> {
    if (!this.sessionState || !this.coordinator) {
      return;
    }

    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (!currentTask) {
      return;
    }

    this.sessionState.executionState = ExecutionState.PLANNING;
    await this.persistState();

    this.emitEvent({
      type: 'plan_start' as EventType,
      actor: 'planner',
      state: 'Planning next steps',
      timestamp: Date.now(),
    });

    const planOutput = await this.coordinator.runPlanner({
      task: currentTask,
      browserState: this.sessionState.browserState,
      actionHistory: this.sessionState.actionHistory,
    });

    if (planOutput.result) {
      this.sessionState.plannerHistory.push(planOutput.result as any);
      
      this.emitEvent({
        type: 'plan_ok' as EventType,
        actor: 'planner',
        state: (planOutput.result as any).strategy,
        data: planOutput.result,
        timestamp: Date.now(),
      });
    }
  }

  private async runNavigator(): Promise<void> {
    if (!this.sessionState || !this.coordinator) {
      return;
    }

    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (!currentTask) {
      return;
    }

    this.sessionState.executionState = ExecutionState.EXECUTING;
    await this.persistState();

    const lastPlan = this.coordinator.getLastPlan();
    const recentActions = this.sessionState.actionHistory.slice(-5);

    const navOutput = await this.coordinator.runNavigator({
      task: currentTask,
      browserState: this.sessionState.browserState,
      plannerGuidance: lastPlan,
      recentActions,
      screenshot: this.sessionState.browserState?.screenshot,
    });

    if (navOutput.result) {
      const actions = (navOutput.result as any).actions || [];
      this.actionQueue.push(...actions);
    }
  }

  private async handleGetNextAction(): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Check if there's an action in the queue
    if (this.actionQueue.length > 0) {
      const action = this.actionQueue.shift();
      this.sessionState.currentAction = action!;
      this.sessionState.executionState = ExecutionState.WAITING_FOR_RESULT;
      this.sessionState.updatedAt = Date.now();
      await this.persistState();

      this.emitEvent({
        type: 'act_start' as EventType,
        actor: 'navigator',
        state: action!.type,
        data: action,
        timestamp: Date.now(),
      });

      return new Response(
        JSON.stringify({ action }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // No action available
    return new Response(
      JSON.stringify({
        action: null,
        executionState: this.sessionState.executionState,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleActionResult(request: Request): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const body = await request.json() as ActionResult;

    // Store action result
    if (this.sessionState.currentAction) {
      this.sessionState.actionHistory.push({
        action: this.sessionState.currentAction,
        result: body,
      });

      // Update browser state if provided
      if (body.domState) {
        this.sessionState.browserState = body.domState as BrowserState;
      }

      // Update consecutive failures
      if (body.success) {
        this.sessionState.consecutiveFailures = 0;
        
        this.emitEvent({
          type: 'act_ok' as EventType,
          actor: 'navigator',
          state: this.sessionState.currentAction.type,
          data: body,
          timestamp: Date.now(),
        });
      } else {
        this.sessionState.consecutiveFailures++;
        
        this.emitEvent({
          type: 'act_fail' as EventType,
          actor: 'navigator',
          state: body.error || 'Action failed',
          data: body,
          timestamp: Date.now(),
        });

        // Check if too many failures
        if (this.sessionState.consecutiveFailures >= this.sessionState.config.maxFailures) {
          this.sessionState.executionState = ExecutionState.FAILED;
          const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
          if (currentTask) {
            currentTask.status = TaskStatus.FAILED;
            currentTask.completedAt = Date.now();
          }
        }
      }

      this.sessionState.currentAction = null;
      this.sessionState.updatedAt = Date.now();
      await this.persistState();

      // Continue execution if waiting for result
      if (this.sessionState.executionState === ExecutionState.WAITING_FOR_RESULT) {
        this.sessionState.executionState = ExecutionState.PLANNING;
        if (!this.executionPromise) {
          this.executionPromise = this.executeTask();
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleUpdateState(request: Request): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const body = await request.json() as BrowserState;

    this.sessionState.browserState = {
      ...body,
      timestamp: Date.now(),
    };
    this.sessionState.updatedAt = Date.now();
    await this.persistState();

    this.emitEvent({
      type: 'state_update' as EventType,
      actor: 'system',
      state: body.url,
      data: { url: body.url, title: body.title },
      timestamp: Date.now(),
    });

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handlePause(): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    this.sessionState.executionState = ExecutionState.PAUSED;
    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (currentTask) {
      currentTask.status = TaskStatus.PAUSED;
    }
    this.sessionState.updatedAt = Date.now();
    await this.persistState();

    this.emitEvent({
      type: 'task_pause' as EventType,
      actor: 'system',
      state: 'Task paused',
      timestamp: Date.now(),
    });

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleResume(): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (this.sessionState.executionState === ExecutionState.PAUSED) {
      this.sessionState.executionState = ExecutionState.PLANNING;
      const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
      if (currentTask) {
        currentTask.status = TaskStatus.RUNNING;
      }
      this.sessionState.updatedAt = Date.now();
      await this.persistState();

      // Resume execution
      if (!this.executionPromise) {
        this.executionPromise = this.executeTask();
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleCancel(): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    this.sessionState.executionState = ExecutionState.COMPLETED;
    const currentTask = this.sessionState.tasks[this.sessionState.currentTaskIndex];
    if (currentTask) {
      currentTask.status = TaskStatus.CANCELLED;
      currentTask.completedAt = Date.now();
    }
    this.sessionState.updatedAt = Date.now();
    this.actionQueue = [];
    await this.persistState();

    this.emitEvent({
      type: 'task_cancel' as EventType,
      actor: 'system',
      state: 'Task cancelled',
      timestamp: Date.now(),
    });

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleGetHistory(): Promise<Response> {
    if (!this.sessionState) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        sessionId: this.sessionState.sessionId,
        tasks: this.sessionState.tasks,
        currentTaskIndex: this.sessionState.currentTaskIndex,
        executionState: this.sessionState.executionState,
        actionHistory: this.sessionState.actionHistory,
        plannerHistory: this.sessionState.plannerHistory,
        stepCount: this.sessionState.stepCount,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleEventStream(request: Request): Promise<Response> {
    // Server-Sent Events for real-time updates
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const listener = (event: EventData) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      writer.write(encoder.encode(data)).catch(() => {
        // Client disconnected
        this.eventListeners.delete(listener);
      });
    };

    this.eventListeners.add(listener);

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });
  }

  private async handleReplay(request: Request): Promise<Response> {
    if (!this.sessionState || !this.sessionState.config.enableReplay) {
      return new Response(
        JSON.stringify({ error: 'Replay not enabled' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Save current session for replay
    const replaySession: ReplaySession = {
      sessionId: this.sessionState.sessionId,
      taskDescription: this.sessionState.tasks[0]?.description || '',
      actions: this.sessionState.actionHistory,
      createdAt: Date.now(),
    };

    await this.state.storage.put(`replay-${this.sessionState.sessionId}`, replaySession);

    return new Response(
      JSON.stringify({
        success: true,
        replayId: this.sessionState.sessionId,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private async handleExtract(request: Request): Promise<Response> {
    if (!this.sessionState || !this.coordinator) {
      return new Response(
        JSON.stringify({ error: 'Session not initialized' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const body = await request.json() as {
      fields: string[];
      content: string;
      extractionPrompt?: string;
    };

    const extractOutput = await this.coordinator.runExtractor(body);

    if (extractOutput.error) {
      return new Response(
        JSON.stringify({ error: extractOutput.error }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: (extractOutput.result as ExtractorOutput).extractedData,
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  private emitEvent(event: EventData): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error emitting event:', error);
      }
    }
  }

  private async persistState(): Promise<void> {
    if (this.sessionState) {
      // Convert Map to plain object for storage
      const stateToStore = {
        ...this.sessionState,
        contentCache: Object.fromEntries(this.sessionState.contentCache),
      };
      await this.state.storage.put('session', stateToStore);
    }
  }
}
