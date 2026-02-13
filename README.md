# Agent Browser Backend v2.0 - Complete Implementation

🚀 **Full-Featured AI Browser Automation Backend** matching nanobrowser capabilities with backend/frontend architecture.

## ✨ Key Features

### Multi-Agent Architecture
- **Planner Agent**: Strategic planning and task decomposition
- **Navigator Agent**: Tactical action execution with vision support
- **Extractor Agent**: Intelligent data extraction from web pages

### Vision & Analysis
- ✅ Screenshot analysis with vision-capable models (GPT-4V, Claude 3)
- ✅ Visual element detection and reasoning
- ✅ CAPTCHA handling capabilities

### Complete Action Set (25 Actions)
All actions from original nanobrowser plus more:
- Navigation: `navigate`, `go_back`
- Interaction: `click`, `type`, `hover`, `select`
- Scrolling: `scroll`, `scroll_to_top`, `scroll_to_bottom`, `scroll_to_text`, `scroll_to_percent`
- Tab Management: `open_tab`, `close_tab`, `switch_tab`
- Page Control: `wait`, `screenshot`
- Data: `extract`, `cache_content`
- Keyboard: `press_key`, `send_keys`
- Dropdowns: `get_dropdown_options`
- Shortcuts: `search_google`
- Pagination: `next_page`, `previous_page`
- Completion: `complete`

### Advanced Features
- ✅ **Follow-Up Tasks**: Add new tasks mid-execution
- ✅ **Periodic Re-planning**: Adaptive strategy every N steps
- ✅ **Event System**: Real-time updates via Server-Sent Events
- ✅ **Replay System**: Record and replay sessions
- ✅ **Error Recovery**: Retry logic and failure tracking
- ✅ **Content Caching**: Cache page content for reuse
- ✅ **Configurable**: Fine-tune max steps, planning intervals, etc.

## 🏗️ Architecture

```
┌──────────────────┐
│ Chrome Extension │
│    (Frontend)    │
└────────┬─────────┘
         │ HTTP/SSE
         ▼
┌──────────────────┐
│  Cloudflare      │
│  Workers (API)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌─────────────────┐
│ Durable Objects  │────▶│ Multi-Agent     │
│  (Session State) │     │ Coordinator     │
└──────────────────┘     └────────┬────────┘
                                  │
         ┌────────────────────────┼────────────────────┐
         ▼                        ▼                    ▼
    ┌─────────┐             ┌──────────┐         ┌──────────┐
    │ Planner │             │Navigator │         │Extractor │
    │  Agent  │             │  Agent   │         │  Agent   │
    └─────────┘             └──────────┘         └──────────┘
         │                        │                    │
         └────────────────────────┼────────────────────┘
                                  ▼
                          ┌──────────────┐
                          │  LLM APIs    │
                          │ (GPT/Claude) │
                          └──────────────┘
```

## 📦 Installation

```bash
# Clone and install
git clone <repo>
cd agent-browser-v2
npm install

# Login to Cloudflare
wrangler login

# Configure account ID in wrangler.toml
wrangler whoami  # Get your account ID

# Set API key
wrangler secret put OPENAI_API_KEY

# Deploy
npm run deploy
```

## 🚀 API Reference

### Create Session
```http
POST /api/sessions/create
Content-Type: application/json

{
  "extensionId": "optional-id"
}

Response:
{
  "sessionId": "session-123",
  "durableObjectId": "do-456"
}
```

### Execute Task
```http
POST /api/sessions/:sessionId/execute
Content-Type: application/json

{
  "task": "Find the price of iPhone 15",
  "tabId": 123,
  "url": "https://apple.com",
  "apiKey": "your-key",  // Optional if set as secret
  "model": "gpt-4o",
  "provider": "openai",
  "config": {
    "maxSteps": 50,
    "planningInterval": 3,
    "useVision": true,
    "enableReplay": true,
    "maxActionsPerStep": 3,
    "maxFailures": 3
  }
}

Response:
{
  "success": true,
  "taskId": "task-789",
  "sessionId": "session-123"
}
```

### Follow-Up Task (NEW!)
```http
POST /api/sessions/:sessionId/follow-up
Content-Type: application/json

{
  "task": "Now compare it with Samsung S24"
}

Response:
{
  "success": true,
  "taskId": "task-790"
}
```

### Get Next Action
```http
GET /api/sessions/:sessionId/next-action

Response:
{
  "action": {
    "id": "act-1",
    "type": "navigate",
    "url": "https://apple.com",
    "reasoning": "Going to Apple website",
    "timestamp": 1234567890
  }
}
```

### Report Action Result
```http
POST /api/sessions/:sessionId/action-result
Content-Type: application/json

{
  "actionId": "act-1",
  "success": true,
  "result": {},
  "screenshot": "base64...",  // Include for vision models
  "domState": {
    "url": "https://apple.com",
    "title": "Apple",
    "domTree": [...]
  }
}
```

### Event Stream (NEW!)
```http
GET /api/sessions/:sessionId/events

Returns Server-Sent Events:
data: {"type":"task_start","actor":"system","state":"task-789"}
data: {"type":"plan_start","actor":"planner","state":"Planning..."}
data: {"type":"plan_ok","actor":"planner","state":"Strategy..."}
data: {"type":"act_start","actor":"navigator","state":"click"}
data: {"type":"act_ok","actor":"navigator","state":"click"}
```

### Extract Data (NEW!)
```http
POST /api/sessions/:sessionId/extract
Content-Type: application/json

{
  "fields": ["price", "title", "description"],
  "content": "<html>...</html>",
  "extractionPrompt": "Extract product information"
}

Response:
{
  "success": true,
  "data": {
    "price": "999",
    "title": "iPhone 15 Pro",
    "description": "..."
  }
}
```

### Save Replay (NEW!)
```http
POST /api/sessions/:sessionId/replay

Response:
{
  "success": true,
  "replayId": "session-123"
}
```

## 🎯 All Action Types

### Navigation Actions
```javascript
// Navigate to URL
{
  type: "navigate",
  url: "https://example.com",
  reasoning: "Going to target site"
}

// Browser back button
{
  type: "go_back",
  reasoning: "Going back to previous page"
}
```

### Interaction Actions
```javascript
// Click element
{
  type: "click",
  selector: "button.buy-now",
  reasoning: "Clicking purchase button"
}

// Type text
{
  type: "type",
  selector: "input[name='search']",
  text: "iPhone 15",
  clearFirst: true,
  reasoning: "Entering search query"
}

// Hover over element
{
  type: "hover",
  selector: ".dropdown-menu",
  reasoning: "Opening dropdown"
}

// Select dropdown option
{
  type: "select",
  selector: "select#country",
  value: "US",
  reasoning: "Selecting country"
}
```

### Scrolling Actions
```javascript
// Basic scroll
{
  type: "scroll",
  direction: "down",
  amount: 500,
  reasoning: "Scrolling to see more"
}

// Scroll to top
{
  type: "scroll_to_top",
  reasoning: "Going to page top"
}

// Scroll to bottom
{
  type: "scroll_to_bottom",
  reasoning: "Loading all content"
}

// Scroll to text
{
  type: "scroll_to_text",
  text: "Specifications",
  reasoning: "Finding specs section"
}

// Scroll to percentage
{
  type: "scroll_to_percent",
  percent: 75,
  reasoning: "Scrolling 75% down"
}
```

### Tab Management Actions
```javascript
// Open new tab
{
  type: "open_tab",
  url: "https://example.com",
  reasoning: "Opening comparison in new tab"
}

// Close tab
{
  type: "close_tab",
  tabId: 123,
  reasoning: "Closing completed tab"
}

// Switch tab
{
  type: "switch_tab",
  tabId: 456,
  reasoning: "Switching to other tab"
}
```

### Data Actions
```javascript
// Extract data with LLM
{
  type: "extract",
  fields: ["price", "title"],
  extractionPrompt: "Extract product details",
  reasoning: "Gathering product info"
}

// Cache content
{
  type: "cache_content",
  cacheKey: "product-page",
  selector: ".product-details",
  reasoning: "Saving product details"
}
```

### Keyboard Actions
```javascript
// Press single key
{
  type: "press_key",
  key: "Enter",
  modifiers: ["Ctrl"],
  reasoning: "Submitting form"
}

// Send key sequence
{
  type: "send_keys",
  keys: "Ctrl+C",
  reasoning: "Copying text"
}
```

### Utility Actions
```javascript
// Wait
{
  type: "wait",
  duration: 2000,
  reason: "Waiting for page load",
  reasoning: "Page needs time to render"
}

// Screenshot
{
  type: "screenshot",
  reasoning: "Capturing current state"
}

// Get dropdown options
{
  type: "get_dropdown_options",
  selector: "select#colors",
  reasoning: "Checking available colors"
}

// Google search shortcut
{
  type: "search_google",
  query: "iPhone 15 review",
  reasoning: "Quick Google search"
}

// Pagination
{
  type: "next_page",
  reasoning: "Going to next results page"
}

{
  type: "previous_page",
  reasoning: "Going back a page"
}

// Complete task
{
  type: "complete",
  result: "iPhone 15 costs $799",
  success: true,
  reasoning: "Task completed successfully"
}
```

## 🔄 Execution Flow

### Standard Flow
```
1. Extension creates session
2. Extension executes task
3. Backend: Planner analyzes task → generates strategy
4. Backend: Navigator generates 1-3 actions
5. Extension polls for next action
6. Extension executes action in browser
7. Extension reports result (with screenshot if vision enabled)
8. Backend: Updates state
9. Repeat steps 4-8 until:
   - Every N steps: Planner re-evaluates strategy
   - Task completion detected
   - Max steps reached
```

### With Follow-Up Tasks
```
1. Complete first task
2. Extension sends follow-up task
3. Backend: Adds to task queue, continues execution
4. Context preserved from previous task
```

### With Vision
```
1. Extension sends screenshot with state update
2. Backend: Navigator uses vision model to analyze
3. Actions generated based on visual understanding
4. Better handling of visual elements, CAPTCHAs, etc.
```

## 🎛️ Configuration Options

```typescript
interface ExecutionConfig {
  maxSteps: number;              // Default: 50
  maxFailures: number;           // Default: 3
  planningInterval: number;      // Default: 3 (re-plan every 3 steps)
  useVision: boolean;            // Default: true
  enableReplay: boolean;         // Default: true
  maxActionsPerStep: number;     // Default: 3
}
```

## 📊 Event Types

The event stream provides real-time updates:

- `task_start`: Task execution begins
- `task_ok`: Task completed successfully
- `task_fail`: Task failed
- `task_cancel`: Task was cancelled
- `task_pause`: Task paused
- `plan_start`: Planner is analyzing
- `plan_ok`: Planning complete
- `plan_fail`: Planning failed
- `act_start`: Action execution starts
- `act_ok`: Action succeeded
- `act_fail`: Action failed
- `state_update`: Browser state changed

## 🔌 Chrome Extension Integration

### Basic Usage
```javascript
const client = new AgentBrowserClient('https://your-worker.workers.dev');

// Create session
const sessionId = await client.createSession();

// Execute task
await client.executeTask({
  task: "Find iPhone 15 price",
  tabId: tab.id,
  url: tab.url,
  model: "gpt-4o",
  provider: "openai",
});

// Poll and execute
while (true) {
  const { action } = await client.getNextAction();
  if (!action) break;
  
  const result = await executeInBrowser(action, tab.id);
  await client.reportResult({
    ...result,
    screenshot: await captureScreenshot(),
    domState: await buildDOMTree(),
  });
  
  if (action.type === 'complete') break;
}
```

### With Event Listening
```javascript
const eventSource = new EventSource(
  `https://your-worker.workers.dev/api/sessions/${sessionId}/events`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.actor}] ${data.type}: ${data.state}`);
  
  // Update UI based on events
  if (data.type === 'plan_ok') {
    updatePlanDisplay(data.data);
  }
};
```

### Follow-Up Example
```javascript
// Initial task
await client.executeTask({
  task: "Find iPhone 15 specs",
  ...
});

// After completion, follow up
await client.followUpTask({
  task: "Now compare with Samsung S24"
});
// Context is preserved, continues from where it left off
```

## 🎨 Vision Model Support

### Supported Models
- GPT-4o (OpenAI)
- GPT-4-turbo (OpenAI)
- Claude 3 Opus (Anthropic)
- Claude 3.5 Sonnet (Anthropic)
- Claude 3 Haiku (Anthropic)

### Automatic Detection
Vision support is automatically detected based on model name. Screenshots are sent when:
- Model supports vision
- `useVision: true` in config
- Screenshot provided in state update

## 📈 Comparison with v1.0

| Feature | v1.0 | v2.0 |
|---------|------|------|
| Agents | Single | Multi (Planner/Navigator/Extractor) |
| Vision | ❌ | ✅ |
| Actions | 11 | 25 |
| Follow-Up Tasks | ❌ | ✅ |
| Replay | ❌ | ✅ |
| Events | ❌ | ✅ (SSE) |
| Re-planning | Once | Periodic |
| Tab Management | ❌ | ✅ |
| Extraction | Basic | LLM-powered |
| Error Recovery | Basic | Advanced |

## 🔧 Development

```bash
# Local development
npm run dev

# Type checking
npm run type-check

# Deploy
npm run deploy

# View logs
wrangler tail
```

## 📝 Examples

See `examples/` directory for:
- Complete Chrome extension implementation
- Event stream handling
- Vision integration
- Follow-up task management
- Replay functionality

## 🚀 Production Deployment

1. Set environment variables
2. Configure custom domain (optional)
3. Set up monitoring
4. Enable rate limiting (recommended)
5. Review and test thoroughly

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please check the issues page.

---

**Built with ❤️ using Cloudflare Workers, Durable Objects, and cutting-edge LLM technology.**
