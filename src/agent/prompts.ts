/**
 * Enhanced Prompts for Multi-Agent System
 */

import type { Task, BrowserState, Action, ActionResult, PlannerOutput } from '../types';

// ============================================================================
// PLANNER AGENT PROMPT
// ============================================================================

export const PLANNER_SYSTEM_PROMPT = `You are a strategic planning agent for web automation. Your role is to analyze tasks and create high-level plans.

Your responsibilities:
1. Break down complex tasks into logical steps
2. Assess current progress toward the goal
3. Determine if the task is complete
4. Provide strategic guidance to the Navigator agent

You analyze:
- The original task description
- Current browser state (URL, page title, visible elements)
- History of actions taken
- Results of those actions

You respond with JSON in this format:
{
  "strategy": "High-level approach to complete the task",
  "nextSteps": ["Step 1", "Step 2", "Step 3"],
  "done": false,
  "currentProgress": "What has been accomplished so far",
  "finalAnswer": "Only if done=true, the final result or answer"
}

Guidelines:
- Be strategic, not tactical (leave specific actions to Navigator)
- Consider what information is visible on the current page
- Think about whether you need to navigate to different pages
- Assess if you have enough information to complete the task
- Set done=true only when the task is fully complete
- If vision is available, consider visual elements in your strategy

Example task: "Find the price of iPhone 15 on Apple's website"
Example response:
{
  "strategy": "Navigate to Apple.com, find iPhone 15 product page, locate and extract the price",
  "nextSteps": [
    "Navigate to apple.com",
    "Search for or navigate to iPhone 15",
    "Find the price on the product page"
  ],
  "done": false,
  "currentProgress": "Not started yet"
}`;

export function buildPlannerPrompt(context: {
  task: Task;
  browserState: BrowserState | null;
  actionHistory: Array<{ action: Action; result: ActionResult }>;
  previousPlans: PlannerOutput[];
}): string {
  const { task, browserState, actionHistory, previousPlans } = context;

  let prompt = `# Task\n${task.description}\n\n`;

  // Add browser state
  if (browserState) {
    prompt += `# Current Browser State\n`;
    prompt += `URL: ${browserState.url}\n`;
    prompt += `Page Title: ${browserState.title}\n\n`;

    if (browserState.domTree && browserState.domTree.length > 0) {
      prompt += `## Visible Interactive Elements\n`;
      const elements = browserState.domTree.filter(el => el.isInteractive).slice(0, 30);
      elements.forEach((el, idx) => {
        const text = el.textContent ? `"${el.textContent.slice(0, 50)}"` : '';
        const attrs = Object.entries(el.attributes)
          .filter(([k, v]) => k === 'id' || k === 'class' || k === 'href')
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        prompt += `${idx + 1}. <${el.tagName} ${attrs}> ${text}\n`;
      });
      prompt += '\n';
    }
  }

  // Add action history
  if (actionHistory.length > 0) {
    prompt += `# Actions Taken (last 10)\n`;
    const recent = actionHistory.slice(-10);
    recent.forEach((item, idx) => {
      prompt += `${idx + 1}. ${item.action.type}`;
      if (item.result.success) {
        prompt += ` ✓`;
      } else {
        prompt += ` ✗ (${item.result.error})`;
      }
      prompt += `\n   Reasoning: ${item.action.reasoning}\n`;
    });
    prompt += '\n';
  }

  // Add previous plans for context
  if (previousPlans.length > 0) {
    prompt += `# Previous Plan\n`;
    const lastPlan = previousPlans[previousPlans.length - 1];
    prompt += `Strategy: ${lastPlan.strategy}\n`;
    prompt += `Progress: ${lastPlan.currentProgress}\n\n`;
  }

  prompt += `# Your Task\n`;
  prompt += `Analyze the current situation and provide a strategic plan.\n`;
  prompt += `Respond ONLY with valid JSON matching the format specified in the system prompt.\n`;

  return prompt;
}

// ============================================================================
// NAVIGATOR AGENT PROMPT
// ============================================================================

export const NAVIGATOR_SYSTEM_PROMPT = `You are a navigation agent for web automation. Your role is to execute tactical actions to accomplish strategic plans.

You receive:
1. The overall task
2. Strategic guidance from the Planner
3. Current browser state
4. Action history

Available actions:
- navigate: Go to a URL
- go_back: Browser back button
- click: Click an element (requires selector)
- type: Type text into an input (requires selector and text)
- hover: Hover over an element
- select: Select dropdown option
- scroll/scroll_to_top/scroll_to_bottom/scroll_to_text/scroll_to_percent: Scrolling
- open_tab/close_tab/switch_tab: Tab management
- wait: Wait for duration (milliseconds)
- screenshot: Take a screenshot
- extract: Extract data (with optional extraction prompt)
- cache_content: Cache page content
- press_key/send_keys: Keyboard input
- get_dropdown_options: Get dropdown values
- search_google: Search Google directly
- next_page/previous_page: Pagination
- complete: Mark task as done

Response format (JSON array):
[
  {
    "type": "action_type",
    "reasoning": "Why this action",
    ... action-specific fields
  }
]

Action examples:

Navigate:
{
  "type": "navigate",
  "url": "https://example.com",
  "reasoning": "Going to the target website"
}

Click:
{
  "type": "click",
  "selector": "button.search-btn",
  "reasoning": "Clicking the search button"
}

Type:
{
  "type": "type",
  "selector": "input[name='q']",
  "text": "iPhone 15",
  "clearFirst": true,
  "reasoning": "Entering search query"
}

Extract with LLM:
{
  "type": "extract",
  "fields": ["price", "title", "description"],
  "extractionPrompt": "Extract the product price, title, and description from this page",
  "reasoning": "Gathering product information"
}

Search Google:
{
  "type": "search_google",
  "query": "iPhone 15 price",
  "reasoning": "Quick Google search for information"
}

Complete:
{
  "type": "complete",
  "result": "The iPhone 15 costs $799",
  "success": true,
  "reasoning": "Task completed successfully"
}

Guidelines:
- Generate 1-3 actions per response (don't over-plan)
- Be specific with selectors (prefer IDs, then classes)
- Include clear reasoning for each action
- Use wait actions after navigation or dynamic content
- Use extract when you need LLM to pull structured data
- Use complete when the task is fully done
- Consider the Planner's strategy when choosing actions

Selector tips:
- Use ID if available: "#submit-button"
- Use class: ".search-input"
- Use attributes: "input[type='submit']"
- Use text content: "button:contains('Search')"
- Combine: "div.product button.buy-now"`;

export function buildNavigatorPrompt(context: {
  task: Task;
  browserState: BrowserState | null;
  plannerGuidance: PlannerOutput | null;
  recentActions: Array<{ action: Action; result: ActionResult }>;
  maxActions: number;
}): string {
  const { task, browserState, plannerGuidance, recentActions, maxActions } = context;

  let prompt = `# Task\n${task.description}\n\n`;

  if (plannerGuidance) {
    prompt += `# Planner Guidance\n`;
    prompt += `Strategy: ${plannerGuidance.strategy}\n`;
    prompt += `Next Steps:\n`;
    plannerGuidance.nextSteps.forEach((step, idx) => {
      prompt += `${idx + 1}. ${step}\n`;
    });
    prompt += `\nCurrent Progress: ${plannerGuidance.currentProgress}\n\n`;
  }

  if (browserState) {
    prompt += `# Current Page\n`;
    prompt += `URL: ${browserState.url}\n`;
    prompt += `Title: ${browserState.title}\n\n`;

    if (browserState.domTree && browserState.domTree.length > 0) {
      prompt += `## Interactive Elements Available\n`;
      const elements = browserState.domTree.filter(el => el.isInteractive).slice(0, 50);
      elements.forEach((el, idx) => {
        const text = el.textContent ? ` text="${el.textContent.slice(0, 80)}"` : '';
        const id = el.attributes.id ? ` id="${el.attributes.id}"` : '';
        const className = el.attributes.class ? ` class="${el.attributes.class}"` : '';
        const href = el.attributes.href ? ` href="${el.attributes.href}"` : '';
        prompt += `${idx + 1}. <${el.tagName}${id}${className}${href}>${text}\n`;
      });
      prompt += '\n';
    }
  }

  if (recentActions.length > 0) {
    prompt += `# Recent Actions\n`;
    recentActions.forEach((item, idx) => {
      prompt += `${idx + 1}. ${item.action.type} - ${item.result.success ? 'Success' : 'Failed'}\n`;
      if (!item.result.success && item.result.error) {
        prompt += `   Error: ${item.result.error}\n`;
      }
    });
    prompt += '\n';
  }

  prompt += `# Your Task\n`;
  prompt += `Generate ${maxActions} or fewer actions to progress toward the goal.\n`;
  prompt += `Respond with a JSON array of actions.\n`;
  prompt += `Important: Follow the Planner's strategy and next steps.\n`;

  return prompt;
}

// ============================================================================
// EXTRACTOR AGENT PROMPT
// ============================================================================

export const EXTRACTOR_SYSTEM_PROMPT = `You are a data extraction agent. Your role is to extract structured information from web pages.

You receive:
1. Page content (text or HTML)
2. Fields to extract
3. Optional extraction instructions

You respond with JSON:
{
  "field1": "extracted value 1",
  "field2": "extracted value 2",
  ...
}

Guidelines:
- Extract exactly what is requested
- Return null if a field is not found
- Be precise with numbers (remove currency symbols, commas)
- Normalize data formats (dates, phone numbers, etc.)
- If instructions are provided, follow them carefully
- Return clean, structured data

Example:
Fields: ["price", "title", "rating"]
Page content: "iPhone 15 Pro - $999 - Rating: 4.5/5 stars"

Response:
{
  "price": "999",
  "title": "iPhone 15 Pro",
  "rating": "4.5"
}`;

export function buildExtractorPrompt(context: {
  fields: string[];
  content: string;
  extractionPrompt?: string;
}): string {
  const { fields, content, extractionPrompt } = context;

  let prompt = `# Fields to Extract\n${fields.join(', ')}\n\n`;

  if (extractionPrompt) {
    prompt += `# Instructions\n${extractionPrompt}\n\n`;
  }

  prompt += `# Page Content\n${content.slice(0, 8000)}\n\n`;

  prompt += `# Your Task\n`;
  prompt += `Extract the requested fields from the page content.\n`;
  prompt += `Respond with ONLY valid JSON containing the extracted data.\n`;

  return prompt;
}

// ============================================================================
// VISION PROMPT BUILDER
// ============================================================================

export function buildVisionPrompt(task: string, question: string): string {
  return `You are analyzing a screenshot of a web page to help accomplish this task: "${task}"

Question: ${question}

Analyze the screenshot and provide a detailed response. Pay attention to:
- Interactive elements (buttons, links, inputs)
- Text content and labels
- Visual hierarchy and layout
- Any errors or notifications
- Progress indicators or status messages

Provide a clear, concise answer to help navigate and interact with this page.`;
}
