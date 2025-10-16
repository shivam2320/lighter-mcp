import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpLogger } from "../utils/logger.js";
import {
  createErrorResponse,
  createSuccessResponse,
  LOG_LEVELS,
} from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { getAuthContext } from "@osiris-ai/sdk";
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

interface Position {
  market_id: number;
  symbol: string;
  initial_margin_fraction: string;
  open_order_count: number;
  pending_order_count: number;
  position_tied_order_count: number;
  sign: number;
  position: string;
  avg_entry_price: string;
  position_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  liquidation_price: string;
  margin_mode: number;
  allocated_margin: string;
}

interface AccountResponse {
  code: number;
  total: number;
  accounts: Array<{
    index: number;
    l1_address: string;
    positions: Position[];
  }>;
}

async function getPositionsWithValue(
  lighterMCP: LighterMCP
): Promise<Position[]> {
  try {
    const { token, context } = getAuthContext("osiris");
    if (!token || !context) {
      throw new Error("No token or context found");
    }

    const wallet = lighterMCP.walletToSession[context.sessionId];
    if (!wallet) {
      throw new Error("No wallet found, you need to choose a wallet first with chooseWallet");
    }

    const client = new EVMWalletClient(
      lighterMCP.hubBaseUrl,
      token.access_token,
      context.deploymentId
    );

    const viemAccount = await client.getViemAccount(wallet, "evm:eip155:8453");
    if (!viemAccount) {
      throw new Error("No account found, you need to choose a wallet first with chooseWallet");
    }

    const walletAddress = viemAccount.address;
    
    logger.info("Fetching positions for wallet", { walletAddress });

    // Get account data via direct API call
    const accountResponse = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/account?by=l1_address&value=${walletAddress}`
    );

    if (!accountResponse.ok) {
      throw new Error(`HTTP error! status: ${accountResponse.status}`);
    }

    const accountData: AccountResponse = await accountResponse.json();
    
    if (accountData.code !== 200 || accountData.accounts.length === 0) {
      throw new Error("No account found for the given address");
    }

    const account = accountData.accounts[0];
    const allPositions = account.positions || [];
    
    // Filter positions with position_value > 0
    const positionsWithValue = allPositions.filter(position => {
      const positionValue = parseFloat(position.position_value);
      return positionValue > 0;
    });

    logger.info("Filtered positions with value > 0", {
      totalPositions: allPositions.length,
      positionsWithValue: positionsWithValue.length
    });

    return positionsWithValue;
  } catch (error) {
    logger.error("Failed to fetch positions", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function registerGetPositionsTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("📊 Registering get positions tools...");

  server.tool(
    "get_positions",
    "Retrieve account positions with position_value > 0. Returns only positions that have a positive value.",
    {
      type: "object",
      properties: {},
      required: [],
    },
    async (): Promise<CallToolResult> => {
      try {
        logger.toolCalled("get_positions");

        const positions = await getPositionsWithValue(lighterMCP);

        const formattedPositions = positions.map(position => ({
          symbol: position.symbol,
          market_id: position.market_id,
          position: position.position,
          position_value: position.position_value,
          avg_entry_price: position.avg_entry_price,
          unrealized_pnl: position.unrealized_pnl,
          realized_pnl: position.realized_pnl,
          liquidation_price: position.liquidation_price,
          position_type: position.sign === 1 ? "Long" : position.sign === -1 ? "Short" : "Unknown",
          margin_type: position.margin_mode === 0 ? "Cross" : position.margin_mode === 1 ? "Isolated" : "Unknown"
        }));

        logger.toolCompleted("get_positions");
        return createSuccessResponse(
          `✅ Retrieved ${formattedPositions.length} positions with value > 0`,
          formattedPositions
        );
      } catch (error) {
        return handleToolError("get_positions", error);
      }
    }
  );

  logger.info("✅ Get positions tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Get positions tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
