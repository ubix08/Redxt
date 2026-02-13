/**
 * Multi-Agent System: Planner, Navigator, and Extractor
 */

import type {
  LLMConfig,
  Task,
  BrowserState,
  Action,
  ActionResult,
  AgentOutput,
  AgentType,
  PlannerOutput,
  NavigatorOutput,
  ExtractorOutput,
  LLMMessage,
} from '../types';
import { LLMClient } from './llm-client';
import {
  PLANNER_SYSTEM_PROMPT,
  NAVIGATOR_SYSTEM_PROMPT,
  EXTRACTOR_SYSTEM_PROMPT,
  buildPlannerPrompt,
  buildNavigatorPrompt,
  buildExtractorPrompt,
  buildVisionPrompt,
} from './prompts';
import { ActionParser } from './action-parser';

// ============================================================================
// PLANNER AGENT
// ============================================================================

export class PlannerAgent {
  private llmClient: LLMClient;
  private conversationHistory: LLMMessage[] = [];
  private previousPlans: PlannerOutput[] = [];

  constructor(config: LLMConfig) {
    this.llmClient = new LLMClient(config);
    this.conversationHistory.push({
      role: 'system',
      content: PLANNER_SYSTEM_PROMPT,
    });
  }

  async plan(context: {
    task: Task;
    browserState: BrowserState | null;
    actionHistory: Array<{ action: Action; result: ActionResult }>;
  }): Promise<AgentOutput> {
    const userPrompt = buildPlannerPrompt({
      ...context,
      previousPlans: this.previousPlans,
    });

    this.conversationHistory.push({
      role: 'user',
      content: userPrompt,
    });

    try {
      const response = await this.llmClient.chat(this.conversationHistory);

      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });

      // Parse planner output
      const plannerOutput = this.parsePlannerOutput(response.content);
      this.previousPlans.push(plannerOutput);

      return {
        agent: 'planner' as AgentType,
        result: plannerOutput,
        reasoning: plannerOutput.strategy,
        done: plannerOutput.done,
      };
    } catch (error) {
      console.error('Planner error:', error);
      return {
        agent: 'planner' as AgentType,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parsePlannerOutput(content: string): PlannerOutput {
    try {
      // Extract JSON from markdown code blocks or direct JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       content.match(/\{[\s\S]*\}/);
      
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const parsed = JSON.parse(jsonStr);

      return {
        strategy: parsed.strategy || '',
        nextSteps: parsed.nextSteps || [],
        done: parsed.done || false,
        finalAnswer: parsed.finalAnswer,
        currentProgress: parsed.currentProgress || '',
      };
    } catch (error) {
      console.error('Failed to parse planner output:', error);
      // Return a default plan
      return {
        strategy: 'Continue with the current approach',
        nextSteps: ['Analyze current page', 'Take appropriate action'],
        done: false,
        currentProgress: 'Processing...',
      };
    }
  }

  getLastPlan(): PlannerOutput | null {
    return this.previousPlans[this.previousPlans.length - 1] || null;
  }

  getAllPlans(): PlannerOutput[] {
    return this.previousPlans;
  }
}

// ============================================================================
// NAVIGATOR AGENT
// ============================================================================

export class NavigatorAgent {
  private llmClient: LLMClient;
  private conversationHistory: LLMMessage[] = [];
  private maxActionsPerStep: number;
  private useVision: boolean;

  constructor(config: LLMConfig, options: { maxActionsPerStep?: number; useVision?: boolean } = {}) {
    this.llmClient = new LLMClient(config);
    this.maxActionsPerStep = options.maxActionsPerStep || 3;
    this.useVision = options.useVision !== false;
    
    this.conversationHistory.push({
      role: 'system',
      content: NAVIGATOR_SYSTEM_PROMPT,
    });
  }

  async navigate(context: {
    task: Task;
    browserState: BrowserState | null;
    plannerGuidance: PlannerOutput | null;
    recentActions: Array<{ action: Action; result: ActionResult }>;
    screenshot?: string;
  }): Promise<AgentOutput> {
    const { screenshot, ...promptContext } = context;

    const userPrompt = buildNavigatorPrompt({
      ...promptContext,
      maxActions: this.maxActionsPerStep,
    });

    // Use vision if available and screenshot provided
    const useVisionForThis = this.useVision && 
                              screenshot && 
                              this.llmClient.supportsVision();

    try {
      let response;
      
      if (useVisionForThis) {
        this.conversationHistory.push({
          role: 'user',
          content: userPrompt,
        });
        
        response = await this.llmClient.chatWithVision(
          this.conversationHistory,
          screenshot!
        );
      } else {
        this.conversationHistory.push({
          role: 'user',
          content: userPrompt,
        });
        
        response = await this.llmClient.chat(this.conversationHistory);
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });

      // Parse actions
      const actions = ActionParser.parseActions(response.content);

      const navigatorOutput: NavigatorOutput = {
        actions,
        done: actions.some(a => a.type === 'complete'),
        reasoning: 'Actions generated based on current state',
      };

      return {
        agent: 'navigator' as AgentType,
        result: navigatorOutput,
        done: navigatorOutput.done,
      };
    } catch (error) {
      console.error('Navigator error:', error);
      return {
        agent: 'navigator' as AgentType,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async analyzeScreenshot(task: string, screenshot: string, question: string): Promise<string> {
    if (!this.llmClient.supportsVision()) {
      throw new Error('Current model does not support vision');
    }

    const prompt = buildVisionPrompt(task, question);
    
    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.llmClient.chatWithVision(messages, screenshot);
    return response.content;
  }
}

// ============================================================================
// EXTRACTOR AGENT
// ============================================================================

export class ExtractorAgent {
  private llmClient: LLMClient;

  constructor(config: LLMConfig) {
    this.llmClient = new LLMClient(config);
  }

  async extract(context: {
    fields: string[];
    content: string;
    extractionPrompt?: string;
  }): Promise<AgentOutput> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: EXTRACTOR_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildExtractorPrompt(context),
      },
    ];

    try {
      const response = await this.llmClient.chat(messages);

      // Parse extracted data
      const extractedData = this.parseExtractorOutput(response.content, context.fields);

      const extractorOutput: ExtractorOutput = {
        extractedData,
        fields: context.fields,
      };

      return {
        agent: 'extractor' as AgentType,
        result: extractorOutput,
      };
    } catch (error) {
      console.error('Extractor error:', error);
      return {
        agent: 'extractor' as AgentType,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseExtractorOutput(content: string, fields: string[]): Record<string, unknown> {
    try {
      // Extract JSON from markdown code blocks or direct JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       content.match(/\{[\s\S]*\}/);
      
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const parsed = JSON.parse(jsonStr);

      // Ensure all requested fields are present
      const result: Record<string, unknown> = {};
      for (const field of fields) {
        result[field] = parsed[field] !== undefined ? parsed[field] : null;
      }

      return result;
    } catch (error) {
      console.error('Failed to parse extractor output:', error);
      // Return null for all fields
      const result: Record<string, unknown> = {};
      for (const field of fields) {
        result[field] = null;
      }
      return result;
    }
  }
}

// ============================================================================
// MULTI-AGENT COORDINATOR
// ============================================================================

export class MultiAgentCoordinator {
  private planner: PlannerAgent;
  private navigator: NavigatorAgent;
  private extractor: ExtractorAgent;

  constructor(config: {
    plannerConfig: LLMConfig;
    navigatorConfig: LLMConfig;
    extractorConfig?: LLMConfig;
    options?: {
      maxActionsPerStep?: number;
      useVision?: boolean;
    };
  }) {
    this.planner = new PlannerAgent(config.plannerConfig);
    this.navigator = new NavigatorAgent(config.navigatorConfig, config.options);
    this.extractor = new ExtractorAgent(config.extractorConfig || config.navigatorConfig);
  }

  async runPlanner(context: {
    task: Task;
    browserState: BrowserState | null;
    actionHistory: Array<{ action: Action; result: ActionResult }>;
  }): Promise<AgentOutput> {
    return await this.planner.plan(context);
  }

  async runNavigator(context: {
    task: Task;
    browserState: BrowserState | null;
    plannerGuidance: PlannerOutput | null;
    recentActions: Array<{ action: Action; result: ActionResult }>;
    screenshot?: string;
  }): Promise<AgentOutput> {
    return await this.navigator.navigate(context);
  }

  async runExtractor(context: {
    fields: string[];
    content: string;
    extractionPrompt?: string;
  }): Promise<AgentOutput> {
    return await this.extractor.extract(context);
  }

  async analyzeScreenshot(task: string, screenshot: string, question: string): Promise<string> {
    return await this.navigator.analyzeScreenshot(task, screenshot, question);
  }

  getLastPlan(): PlannerOutput | null {
    return this.planner.getLastPlan();
  }

  getAllPlans(): PlannerOutput[] {
    return this.planner.getAllPlans();
  }
}
