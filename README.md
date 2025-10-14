# lighter-mcp

lighter-mcp

## Features

- ✅ Built with Model Context Protocol (MCP) SDK
- 🔐 Integrated authentication via Osiris Hub
- 📊 PostgreSQL database
- 🔷 TypeScript
- 🛠️ Example tools, resources, prompts, and schemas

## Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development server:**
   ```bash
   pnpm run dev
   ```

## Configuration

### Environment Variables

- `HUB_BASE_URL` - Your Osiris Hub URL
- `OAUTH_CLIENT_ID` - OAuth client ID from Hub
- `OAUTH_CLIENT_SECRET` - OAuth client secret from Hub
- `DATABASE_ADAPTER` - Database type (postgres)

### Database Setup


#### PostgreSQL
1. Install PostgreSQL
2. Create a database: `createdb lighter-mcp`
3. Set `DATABASE_URL` in your .env file


## Development

### Available Scripts

- `pnpm run dev` - Start development server with hot reload
- `pnpm run build` - Build for production (TypeScript → JavaScript)
- `pnpm run start` - Start production server
- `pnpm run type-check` - Run TypeScript type checking

### Project Structure

```
lighter-mcp/
├── index.ts           # Main MCP server entry point
├── client.ts          # MCP client setup and configuration
├── tools/
│   └── hello-world.ts # Simple hello world tool
├── resources/
│   └── hello-world.ts # Hello world resource
├── prompts/
│   └── hello-world.ts # Hello world prompt template
├── schema/
│   └── index.ts       # Zod schema definitions
├── .env                    # Environment variables
├── .env.example           # Environment template
└── package.json           # Dependencies and scripts
```

## MCP Components

### Tools

#### Hello World Tool
A simple greeting tool that demonstrates basic MCP tool functionality.

**Usage:**
```json
{
  "name": "hello_world",
  "arguments": {
    "name": "Alice"
  }
}
```

### Resources

#### Hello World Resource
Provides a simple JSON resource demonstrating MCP resource functionality.

**URI:** `hello://world`

### Prompts

#### Hello World Prompt
Generates prompts about specified topics.

**Arguments:**
- `topic` (optional): Topic to ask about (default: "osiris")

## Adding New Components

### Adding a Tool

Create a new file in `tools/` and export the tool registration function:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerMyTool(server: McpServer) {
  const MyToolSchema = z.object({
    param1: z.string().describe('Parameter description')
  });
  
  server.tool('my_tool', 'Description of what this tool does', MyToolSchema, async ({ param1 }) => {
    // Your tool logic here
    return {
      content: [{
        type: 'text',
        text: `Tool result: ${param1}`
      }]
    };
  });
}
```

Then register it in `client.ts`.

### Adding a Resource

Create a new file in `resources/` and export the resource registration function:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerMyResource(server: McpServer) {
  server.resource('my://resource', 'My Resource', 'Resource description', async () => {
    return {
      contents: [{
        uri: 'my://resource',
        mimeType: 'application/json',
        text: JSON.stringify({ data: 'Resource data' })
      }]
    };
  });
}
```

## Authentication

This server uses Osiris Hub for authentication. Make sure your Hub is configured and your OAuth credentials are correct.

## Deployment

1. Build the project:
   ```bash
   pnpm run build
   ```

2. Set production environment variables

3. Start the server:
   ```bash
   NODE_ENV=production pnpm run start
   ```

## Support

- 📖 [MCP Documentation](https://modelcontextprotocol.io/docs)
- 📖 [Osiris SDK Documentation](https://docs.osirislabs.xyz)
- 💬 [Community Discord](https://discord.gg/osirislabs)
- 🐛 [Issue Tracker](https://github.com/osirislabs/sdk/issues)

---

Built with ❤️ using [Model Context Protocol](https://modelcontextprotocol.io) and [Osiris SDK](https://osirislabs.xyz)
