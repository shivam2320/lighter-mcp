import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerHelloResource(server: McpServer) {
  server.resource('hello://world', 'Hello World', {
    uri: 'hello://world',
    name: "Hello World",
  }, async () => {
    return {
      contents: [{ uri: 'hello://world', mimeType: 'application/json', text: JSON.stringify({ hello: 'world' }) }]
    };
  });
}

