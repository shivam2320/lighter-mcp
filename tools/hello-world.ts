import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HelloToolSchema } from '../schema/index.js';

export function registerHelloTool(server: McpServer) {
  server.tool('hello_world', 'Say hello', HelloToolSchema, async ({ name }) => {
    const greeting = '👋 Hello, ' + (name || 'World') + '!';
    return {
      content: [ { type: 'text', text: greeting } ]
    };
  });
}

