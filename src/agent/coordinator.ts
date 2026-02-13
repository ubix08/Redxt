/**
 * Enhanced Multi-Agent Coordinator
 * Integrates security guardrails, strategic planning, and error recovery
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  PlannerInput,
  PlannerOutput,
  ActorInput,
  ActorOutput,
  ExtractorInput,
  ExtractorOutput,
  SessionState,
  StrategicPlan,
  BrowserAction,
  SecurityEvent,
} from '../types';
import { guardrails, ThreatType } from '../security/guardrails';
import { RetryExecutor, EnhancedError } from '../utils/error-handling';
import { ToolRegistry } from '../tools/registry';

export class EnhancedCoordinator {
  private anthropic: Anthropic;
  private retryExecutor: RetryExecutor;
  private toolRegistry: ToolRegistry;
  
  constructor(
    apiKey: string,
    private sessionState: SessionState,
    toolRegistry: ToolRegistry
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.retryExecutor = new RetryExecutor(sessionState.config.retryStrategy);
    this.toolRegistry = toolRegistry;
  }
  
  // ==========================================================================
  // PLANNER AGENT - Strategic Planning with Security
  // ==========================================================================
  
  async runPlanner(input: PlannerInput): Promise<PlannerOutput> {
    const startTime = Date.now();
    
    try {
      return await this.retryExecutor.executeWithRetry(
        () => this.executePlanner(input),
        {
          operationName: 'Planner',
          step: input.stepCount,
        }
      );
    } finally {
      const duration = Date.now() - startTime;
      this.sessionState.metrics.totalExecutionTime += duration;
      this.sessionState.metrics.llmCalls++;
    }
  }
  
  private async executePlanner(input: PlannerInput): Promise<PlannerOutput> {
    // Sanitize and secure browser state
    const sanitizedDOM = this.sanitizeExternalContent(input.currentState.dom);
    
    // Build strategic planning prompt
    const systemPrompt = this.buildPlannerSystemPrompt();
    const userPrompt = this.buildPlannerUserPrompt(input, sanitizedDOM);
    
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });
    
    // Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Expected text response from planner');
    }
    
    const plannerOutput = this.parsePlannerResponse(content.text);
    
    // Track tokens
    this.sessionState.metrics.llmTokensUsed += 
      (response.usage.input_tokens + response.usage.output_tokens);
    
    return plannerOutput;
  }
  
  private buildPlannerSystemPrompt(): string {
    const toolDescriptions = this.toolRegistry
      .getDefinitionsForLLM()
      .map(tool => `- ${tool.name}: ${tool.description}`)
      .join('\n');
    
    return `You are an expert browser automation planner. Your role is to create strategic, multi-step plans to accomplish user tasks through browser automation.

AVAILABLE TOOLS:
${toolDescriptions}

YOUR RESPONSIBILITIES:
1. Analyze the current browser state and task requirements
2. Create a strategic plan with clear steps
3. Identify potential risks and create contingency plans
4. Determine the best next action to take
5. Recognize when the task is complete

STRATEGIC THINKING:
- Look ahead multiple steps when possible
- Consider alternative approaches
- Identify potential failure points
- Plan for edge cases

OUTPUT FORMAT:
Respond with a JSON object containing:
{
  "strategy": "Overall approach to complete the task",
  "estimatedSteps": <number>,
  "confidence": <0-1>,
  "nextAction": {
    "type": "tool_name",
    "params": { /* tool parameters */ },
    "reasoning": "Why this action"
  },
  "plannedActions": [
    {
      "action": { "type": "...", "params": {...} },
      "reasoning": "...",
      "priority": <1-10>
    }
  ],
  "successCriteria": ["criterion1", "criterion2"],
  "risks": [
    {
      "description": "...",
      "likelihood": "low|medium|high",
      "impact": "low|medium|high",
      "mitigation": "..."
    }
  ],
  "taskComplete": false,
  "result": null
}

If task is complete, set taskComplete=true and provide result.`;
  }
  
  private buildPlannerUserPrompt(input: PlannerInput, sanitizedDOM: string): string {
    const historyText = input.actionHistory.slice(-5)
      .map(a => `- ${a.action.type}: ${JSON.stringify(a.action.params)} -> ${a.result.success ? 'Success' : 'Failed'}`)
      .join('\n');
    
    return `TASK: ${input.taskDescription}

CURRENT BROWSER STATE:
URL: ${input.currentState.url}
Title: ${input.currentState.title}

INTERACTIVE ELEMENTS:
${sanitizedDOM}

PREVIOUS ACTIONS (last 5):
${historyText || 'None'}

PROGRESS:
Step ${input.stepCount} of ${input.maxSteps}

${input.currentPlan ? `CURRENT PLAN:\n${JSON.stringify(input.currentPlan, null, 2)}\n` : ''}

What should be the next action? Provide your strategic analysis and decision.`;
  }
  
  private parsePlannerResponse(text: string): PlannerOutput {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
      }
      
      const parsed = JSON.parse(jsonText);
      
      // Build strategic plan if provided
      let plan: StrategicPlan | undefined;
      if (parsed.strategy && parsed.plannedActions) {
        plan = {
          strategy: parsed.strategy,
          estimatedSteps: parsed.estimatedSteps || 10,
          confidence: parsed.confidence || 0.7,
          plannedActions: parsed.plannedActions || [],
          successCriteria: parsed.successCriteria || [],
          risks: parsed.risks || [],
          createdAt: Date.now(),
        };
      }
      
      return {
        plan,
        nextAction: parsed.nextAction,
        reasoning: parsed.nextAction?.reasoning || parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0.7,
        needsRevision: parsed.needsRevision || false,
        taskComplete: parsed.taskComplete || false,
        result: parsed.result,
      };
    } catch (error) {
      throw new Error(`Failed to parse planner response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // ==========================================================================
  // ACTOR AGENT - Action Execution
  // ==========================================================================
  
  async runActor(input: ActorInput): Promise<ActorOutput> {
    const startTime = Date.now();
    
    try {
      return await this.retryExecutor.executeWithRetry(
        () => this.executeActor(input),
        {
          operationName: 'Actor',
          step: this.sessionState.stepCount,
          action: input.action,
        }
      );
    } finally {
      const duration = Date.now() - startTime;
      this.sessionState.metrics.totalExecutionTime += duration;
      this.sessionState.metrics.llmCalls++;
    }
  }
  
  private async executeActor(input: ActorInput): Promise<ActorOutput> {
    const { action, browserState } = input;
    
    // Validate action against tool registry
    const validation = this.toolRegistry.validate(action.type, action.params);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Action validation failed: ${validation.errors?.join(', ')}`,
        needsRetry: false,
        browserStateChanged: false,
        taskComplete: false,
      };
    }
    
    // Check if this is a completion action
    if (action.type === 'complete') {
      return {
        success: true,
        result: action.params.result,
        needsRetry: false,
        browserStateChanged: false,
        taskComplete: true,
        completionResult: action.params.result,
      };
    }
    
    // Execute action through tool registry
    const context = {
      sessionId: this.sessionState.sessionId,
      browserState,
      currentStep: this.sessionState.stepCount,
      history: this.sessionState.actionHistory,
      config: this.sessionState.config,
    };
    
    const result = await this.toolRegistry.execute(action.type, action.params, context);
    
    return {
      success: result.success,
      result: result.data,
      error: result.error,
      needsRetry: !result.success,
      browserStateChanged: result.browserStateChanged,
      screenshot: result.screenshot,
      taskComplete: false,
    };
  }
  
  // ==========================================================================
  // EXTRACTOR AGENT - Information Extraction
  // ==========================================================================
  
  async runExtractor(input: ExtractorInput): Promise<{ result?: ExtractorOutput; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Sanitize content before extraction
      const sanitizedContent = this.sanitizeExternalContent(input.content);
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0,
        system: `You are a precise data extraction agent. Extract the requested fields from the provided content and return them as a JSON object. Be accurate and only extract what is explicitly requested.`,
        messages: [
          {
            role: 'user',
            content: `Extract the following fields from the content: ${input.fields.join(', ')}

${input.extractionPrompt ? `Additional instructions: ${input.extractionPrompt}\n\n` : ''}
Content:
${sanitizedContent}

Return only a JSON object with the extracted fields.`,
          },
        ],
      });
      
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from extractor');
      }
      
      // Parse extracted data
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
      }
      
      const extractedData = JSON.parse(jsonText);
      
      // Track tokens
      this.sessionState.metrics.llmTokensUsed += 
        (response.usage.input_tokens + response.usage.output_tokens);
      
      return {
        result: {
          extractedData,
          confidence: 0.9,
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Extraction failed',
      };
    } finally {
      const duration = Date.now() - startTime;
      this.sessionState.metrics.totalExecutionTime += duration;
      this.sessionState.metrics.llmCalls++;
    }
  }
  
  // ==========================================================================
  // SECURITY HELPERS
  // ==========================================================================
  
  private sanitizeExternalContent(content: string): string {
    const strictMode = this.sessionState.config.strictSecurity;
    const result = guardrails.sanitize(content, { strict: strictMode });
    
    // Log security events if threats detected
    if (result.threats.length > 0) {
      const securityEvent: SecurityEvent = {
        type: result.threats[0], // Primary threat
        severity: result.severity,
        content: content.substring(0, 200), // Preview
        sessionId: this.sessionState.sessionId,
        step: this.sessionState.stepCount,
        timestamp: Date.now(),
        blocked: result.modified,
      };
      
      this.sessionState.securityEvents.push(securityEvent);
      this.sessionState.metrics.securityThreatsDetected++;
      
      console.warn('[Security] Threats detected:', {
        threats: result.threats,
        severity: result.severity,
        modified: result.modified,
      });
    }
    
    // Wrap in security banner
    return guardrails.wrapUntrusted(result.sanitized, false);
  }
}
