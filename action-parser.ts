/**
 * Action Parser - Converts LLM output to Action objects
 */

import type { Action } from '../types';
import { ActionType } from '../types';
import { generateId } from '../utils/helpers';

export class ActionParser {
  static parseActions(content: string): Action[] {
    const actions: Action[] = [];

    try {
      // Extract JSON array from markdown code blocks or direct JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       content.match(/\[[\s\S]*\]/) ||
                       content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        // Handle both single action object and array of actions
        const actionList = Array.isArray(parsed) ? parsed : [parsed];

        for (const actionData of actionList) {
          const action = this.createAction(actionData);
          if (action) {
            actions.push(action);
          }
        }
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (error) {
      console.error('Error parsing actions:', error);
      console.error('Content:', content);

      // Return a wait action as fallback
      actions.push({
        id: generateId(),
        type: ActionType.WAIT,
        duration: 1000,
        reasoning: 'Failed to parse LLM response, waiting before retry',
        timestamp: Date.now(),
      });
    }

    return actions;
  }

  private static createAction(data: any): Action | null {
    const baseAction = {
      id: generateId(),
      reasoning: data.reasoning || '',
      timestamp: Date.now(),
    };

    const type = data.type?.toLowerCase().replace(/-/g, '_');

    switch (type) {
      // Navigation
      case 'navigate':
        return {
          ...baseAction,
          type: ActionType.NAVIGATE,
          url: data.url || '',
        };

      case 'go_back':
        return {
          ...baseAction,
          type: ActionType.GO_BACK,
        };

      // Interaction
      case 'click':
      case 'clickelement':
        return {
          ...baseAction,
          type: ActionType.CLICK,
          selector: data.selector || '',
          elementId: data.elementId,
        };

      case 'type':
      case 'inputtext':
        return {
          ...baseAction,
          type: ActionType.TYPE,
          selector: data.selector || '',
          text: data.text || '',
          elementId: data.elementId,
          clearFirst: data.clearFirst,
        };

      case 'hover':
        return {
          ...baseAction,
          type: ActionType.HOVER,
          selector: data.selector || '',
          elementId: data.elementId,
        };

      case 'select':
      case 'selectdropdownoption':
        return {
          ...baseAction,
          type: ActionType.SELECT,
          selector: data.selector || '',
          value: data.value || '',
          elementId: data.elementId,
        };

      // Scrolling
      case 'scroll':
        return {
          ...baseAction,
          type: ActionType.SCROLL,
          direction: data.direction || 'down',
          amount: data.amount,
        };

      case 'scroll_to_top':
      case 'scrolltotop':
        return {
          ...baseAction,
          type: ActionType.SCROLL_TO_TOP,
        };

      case 'scroll_to_bottom':
      case 'scrolltobottom':
        return {
          ...baseAction,
          type: ActionType.SCROLL_TO_BOTTOM,
        };

      case 'scroll_to_text':
      case 'scrolltotext':
        return {
          ...baseAction,
          type: ActionType.SCROLL_TO_TEXT,
          text: data.text || '',
        };

      case 'scroll_to_percent':
      case 'scrolltopercent':
        return {
          ...baseAction,
          type: ActionType.SCROLL_TO_PERCENT,
          percent: data.percent || 50,
        };

      // Tab Management
      case 'open_tab':
      case 'opentab':
        return {
          ...baseAction,
          type: ActionType.OPEN_TAB,
          url: data.url || '',
        };

      case 'close_tab':
      case 'closetab':
        return {
          ...baseAction,
          type: ActionType.CLOSE_TAB,
          tabId: data.tabId,
        };

      case 'switch_tab':
      case 'switchtab':
        return {
          ...baseAction,
          type: ActionType.SWITCH_TAB,
          tabId: data.tabId || 0,
        };

      // Page Control
      case 'wait':
        return {
          ...baseAction,
          type: ActionType.WAIT,
          duration: data.duration || 1000,
          reason: data.reason,
        };

      case 'screenshot':
        return {
          ...baseAction,
          type: ActionType.SCREENSHOT,
        };

      // Data Operations
      case 'extract':
      case 'extractcontent':
        return {
          ...baseAction,
          type: ActionType.EXTRACT,
          selector: data.selector,
          fields: data.fields || [],
          extractionPrompt: data.extractionPrompt,
        };

      case 'cache_content':
      case 'cachecontent':
        return {
          ...baseAction,
          type: ActionType.CACHE_CONTENT,
          selector: data.selector,
          cacheKey: data.cacheKey || '',
        };

      // Keyboard
      case 'press_key':
      case 'presskey':
        return {
          ...baseAction,
          type: ActionType.PRESS_KEY,
          key: data.key || '',
          modifiers: data.modifiers,
        };

      case 'send_keys':
      case 'sendkeys':
        return {
          ...baseAction,
          type: ActionType.SEND_KEYS,
          keys: data.keys || '',
        };

      // Dropdown
      case 'get_dropdown_options':
      case 'getdropdownoptions':
        return {
          ...baseAction,
          type: ActionType.GET_DROPDOWN_OPTIONS,
          selector: data.selector || '',
        };

      // Shortcuts
      case 'search_google':
      case 'searchgoogle':
        return {
          ...baseAction,
          type: ActionType.SEARCH_GOOGLE,
          query: data.query || '',
        };

      // Pagination
      case 'next_page':
      case 'nextpage':
        return {
          ...baseAction,
          type: ActionType.NEXT_PAGE,
        };

      case 'previous_page':
      case 'previouspage':
        return {
          ...baseAction,
          type: ActionType.PREVIOUS_PAGE,
        };

      // Completion
      case 'complete':
      case 'done':
        return {
          ...baseAction,
          type: ActionType.COMPLETE,
          result: data.result || data.text || '',
          success: data.success !== false,
        };

      default:
        console.warn('Unknown action type:', data.type);
        return null;
    }
  }
}
