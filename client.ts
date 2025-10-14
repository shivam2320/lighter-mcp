import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHelloTool } from './tools/hello-world.js';
import { registerHelloPrompt } from './prompts/hello-world.js';
import { registerHelloResource } from './resources/hello-world.js';

export class HelloWorldMCP {
  private hubBaseUrl: string;
  constructor(hubBaseUrl: string) {
    this.hubBaseUrl = hubBaseUrl;
  }

  configureServer(server: McpServer): void {
    registerHelloTool(server);
    registerHelloPrompt(server);
    registerHelloResource(server);
  }
}
