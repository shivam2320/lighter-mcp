import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HelloPromptSchema } from '../schema/index.js';

export function registerHelloPrompt(server: McpServer) {
  server.prompt('hello_world', 'Provide a hello prompt', HelloPromptSchema, async ({ topic }) => {
    const promptText = 'Tell me something cool about ' + (topic || 'Osiris') + '.';
    return {
      description: 'Hello prompt about ' + (topic || 'Osiris'),
      messages: [ { role: 'assistant', content: { type: 'text', text: promptText } } ]
    };
  });
}

