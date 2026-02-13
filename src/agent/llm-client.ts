/**
 * Enhanced LLM Client with Vision Support
 */

import type { LLMConfig, LLMMessage, LLMResponse, MessageContent } from '../types';

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    
    // Detect vision support
    if (!config.supportsVision) {
      this.config.supportsVision = this.detectVisionSupport(config.model);
    }
  }

  private detectVisionSupport(model: string): boolean {
    const visionModels = [
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-4-vision',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-5-sonnet',
      'claude-3-haiku',
    ];
    
    return visionModels.some(vm => model.toLowerCase().includes(vm.toLowerCase()));
  }

  async chat(messages: LLMMessage[], includeImages: boolean = false): Promise<LLMResponse> {
    // Filter out images if model doesn't support vision or not requested
    const processedMessages = this.processMessages(messages, includeImages && this.config.supportsVision);
    
    if (this.config.provider === 'openai') {
      return await this.chatOpenAI(processedMessages);
    } else if (this.config.provider === 'anthropic') {
      return await this.chatAnthropic(processedMessages);
    } else {
      throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }
  }

  private processMessages(messages: LLMMessage[], includeImages: boolean): LLMMessage[] {
    if (includeImages) {
      return messages;
    }

    // Remove image content if not supported or not requested
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return msg;
      }

      // Filter out images from content array
      const textContent = msg.content.filter(c => c.type === 'text');
      if (textContent.length === 0) {
        return { ...msg, content: '' };
      }
      if (textContent.length === 1) {
        return { ...msg, content: (textContent[0] as any).text };
      }
      return { ...msg, content: textContent };
    });
  }

  private async chatOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json() as any;

    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  private async chatAnthropic(messages: LLMMessage[]): Promise<LLMResponse> {
    // Separate system message from other messages
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Convert messages to Anthropic format
    const anthropicMessages = conversationMessages.map(m => {
      let content = m.content;
      
      // Handle multi-modal content for Anthropic
      if (Array.isArray(content)) {
        content = content.map(c => {
          if (c.type === 'text') {
            return {
              type: 'text',
              text: c.text,
            };
          } else if (c.type === 'image_url') {
            // Extract base64 data from data URL
            const base64Data = c.image_url.url.split(',')[1] || c.image_url.url;
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Data,
              },
            };
          }
          return c;
        });
      }

      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: content,
      };
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: typeof systemMessage?.content === 'string' ? systemMessage.content : '',
        messages: anthropicMessages,
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json() as any;

    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  supportsVision(): boolean {
    return this.config.supportsVision || false;
  }

  async chatWithVision(messages: LLMMessage[], screenshot: string): Promise<LLMResponse> {
    if (!this.supportsVision()) {
      throw new Error('This model does not support vision capabilities');
    }

    // Add screenshot to the last user message
    const messagesWithImage = [...messages];
    const lastMessage = messagesWithImage[messagesWithImage.length - 1];

    if (lastMessage && lastMessage.role === 'user') {
      const content: MessageContent[] = [];

      // Add existing text content
      if (typeof lastMessage.content === 'string') {
        content.push({
          type: 'text',
          text: lastMessage.content,
        });
      } else {
        content.push(...(lastMessage.content as MessageContent[]));
      }

      // Add screenshot
      content.push({
        type: 'image_url',
        image_url: {
          url: screenshot.startsWith('data:') ? screenshot : `data:image/jpeg;base64,${screenshot}`,
          detail: 'high',
        },
      });

      messagesWithImage[messagesWithImage.length - 1] = {
        ...lastMessage,
        content,
      };
    }

    return await this.chat(messagesWithImage, true);
  }
}
