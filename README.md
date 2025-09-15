# Tune MCP

MCP (Model Context Protocol) middleware for [Tune](https://github.com/iovdin/tune) - connect to MCP servers via stdio, HTTP, or SSE.

## Setup for Text Editor

Install in your `~/.tune` folder:

```bash
cd ~/.tune
npm install tune-mcp
```

Add to `~/.tune/default.ctx.js`:

```javascript
const tuneMCP = require('tune-mcp')

module.exports = [
    ...
    tuneMCP({ 
        // accepts claude like and vscode like configs
        config: "path/to/config.json",
    })
    // OR single inline mcp config 
    tuneMCP({ 
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
        mount: "playwright"
    })
    // OR multiple inline mcp configs
    tuneMCP({
        playwright: {
            command: "npx",
            args: ["-y", "@playwright/mcp@latest"],
        },
        chrome: {
            type: "streamable-http",
            url: "http://127.0.0.1:12306/mcp"
        }
    }),
    ...
]
```

## Setup for JavaScript Project

```bash
npm install tune-mcp tune-sdk
```

```javascript
const tune = require('tune-sdk')
const tuneMCP = require('tune-mcp')

const ctx = tune.makeContext(
    tuneMCP({ 
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
        mount: "playwright"
    })
)

const result = await ctx.text2run(`
system: @playwright
user: navigate to https://example.com
`)
```

## Usage Examples

### Per-Chat Connection
```chat
system:
connect through stdio
@{| mcp npx -y @playwright/mcp@latest }
@{| mcp stdio npx -y @playwright/mcp@latest }

connect with HTTP streaming
@{| mcp http://localhost:8931/mcp }
@{| mcp streamable-http http://localhost:8931/mcp }

connect with Server-Sent Events
@{| mcp http://localhost:8931/sse }
@{| mcp sse http://localhost:8931/sse }

connect using config file
@{| mcp @path/to/config.json }
@{| mcp config @path/to/config.json }

user:

open https://google.com and make screenshot 
assistant:

tool_call: browser_navigate {"url":"https://google.com"}
tool_result:
### Ran Playwright code
```js
await page.goto('https://google.com');
...
```
## Configuration Options

### Single MCP Server
```javascript
tuneMCP({
    // Command to run MCP server
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    
    // Mount point prefix for accessing tools
    mount: "playwright",  // Access tools as @playwright/toolname
    
    // Environment variables for the server
    env: {
        "API_KEY": "your-api-key"
    },
    
    // HTTP/SSE connection
    url: "http://localhost:8931/mcp",
    type: "streamable-http", // or "sse"
    
    // Headers for HTTP connections
    headers: {
        "Authorization": "Bearer token"
    },
    
    // Expose only specific tools
    expose: ["navigate", "click", "type"]
})
```

### Multiple MCP Servers
```javascript
tuneMCP({
    "playwright": {
        "command": "npx",
        "args": ["-y", "@playwright/mcp@latest"],
        "env": { "HEADLESS": "true" }
    },
    "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]
    },
    "api-server": {
        "url": "http://localhost:8080/mcp",
        "headers": { "Authorization": "Bearer token" }
    }
})
```

### Config File Format
Create a config file (Claude Desktop format):
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "filesystem": {
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Documents"]
    }
  }
}
```

Or VS Code format:
```json
{
  "mcp": {
    "servers": {
      "playwright": {
        "command": "npx",
        "args": ["-y", "@playwright/mcp@latest"]
      }
    }
  }
}
```

## Connection Types

### stdio (Default)
```javascript
tuneMCP({
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    mount: "playwright"
})
```

### HTTP Streaming
```javascript
tuneMCP({
    url: "http://localhost:8931/mcp",
    type: "streamable-http",
    mount: "api"
})
```

### Server-Sent Events (SSE)
```javascript
tuneMCP({
    url: "http://localhost:8931/sse", 
    type: "sse",
    mount: "events"
})
```

## Tool Access Patterns

```chat
user: @playwright/navigate                # Use specific tool
user: @playwright                         # connect all available tools
user: @{| mcp stdio some-mcp-server }     # Connect dynamically in chat
```

## Advanced Usage

### Regex Tool Matching
```javascript
const tools = await ctx.resolve("playwright/.*", { 
    match: "regex", 
    output: "all" 
})
```

### Filtered Tool Access
```javascript
tuneMCP({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    mount: "everything",
    expose: ["echo", "add"]  // Only expose specific tools
})
```

### Multiple Configurations
```javascript
const ctx = tune.makeContext(
    tuneMCP({ command: "npx", args: ["-y", "server1"], mount: "s1" }),
    tuneMCP({ command: "npx", args: ["-y", "server2"], mount: "s2" }),
    tuneMCP({ url: "http://api.example.com/mcp", mount: "api" })
)
```

## Error Handling

The middleware will throw errors for:
- Missing command or URL configuration
- MCP server connection failures  
- Tool execution errors
- Invalid configuration files

```javascript
try {
    const result = await tool.exec({ arg: "value" }, ctx)
} catch (error) {
    console.error("MCP tool error:", error.message)
}
```

## Environment Variables

In configuration:
```javascript
tuneMCP({
    command: "your-mcp-server",
    env: {
        "API_KEY": process.env.API_KEY,
        "DEBUG": "true"
    }
})
```

# TODO
* image as tool result 
* resources
* auth
