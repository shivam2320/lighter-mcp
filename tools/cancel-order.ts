import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getAuthContext } from "@osiris-ai/sdk";
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { McpLogger } from "../utils/logger.js";
import {
  createErrorResponse,
  createSuccessResponse,
  LOG_LEVELS,
} from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { SignerClient } from "lighter-ts-sdk";
import { CancelOrderToolSchema } from "../schema/index.js";
import { pairsData } from "../utils/pairs-data.js";

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

function getMarketIdFromTicker(ticker: string): number {
  const upperTicker = ticker.toUpperCase();
  const pairData = pairsData[upperTicker as keyof typeof pairsData];
  
  if (!pairData) {
    const availableTickers = Object.keys(pairsData).join(", ");
    throw new Error(`Ticker "${ticker}" not found. Available tickers: ${availableTickers}`);
  }
  
  return pairData.market_id;
}

export function registerCancelOrderTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("❌ Registering cancel order tools...");

  server.tool(
    "cancel_order",
    "Cancel an existing order on the Lighter protocol using SignerClient from lighter-ts-sdk. This tool cancels a specific order by its order index.",
    CancelOrderToolSchema,
    async ({
      ticker,
      order_index,
      private_key,
      api_key_index = 0,
    }): Promise<CallToolResult> => {
      try {
        const { token, context } = getAuthContext("osiris");
        if (!token || !context) {
          return createErrorResponse("No token or context found");
        }

        const wallet = lighterMCP.walletToSession[context.sessionId];
        if (!wallet) {
          return createErrorResponse(
            "No wallet found, you need to choose a wallet first with chooseWallet"
          );
        }

        const client = new EVMWalletClient(
          lighterMCP.hubBaseUrl,
          token.access_token,
          context.deploymentId
        );

        const viemAccount = await client.getViemAccount(wallet, "evm:eip155:8453");
        if (!viemAccount) {
          return createErrorResponse(
            "No account found, you need to choose a wallet first with chooseWallet"
          );
        }

        const walletAddress = viemAccount.address;
        
        logger.info("Received parameters", { 
          ticker, 
          order_index,
          walletAddress,
          api_key_index
        });
        
        if (!ticker) {
          return createErrorResponse("Missing required parameter: ticker. Please provide a ticker symbol (e.g., ETH, BTC, SOL)");
        }
        
        logger.toolCalled("cancel_order", {
          ticker,
          order_index,
          walletAddress,
          api_key_index,
        });

        const market_index = getMarketIdFromTicker(ticker);
        
        logger.info("Resolved ticker to market ID", {
          ticker,
          market_index
        });

        const accountResponse = await fetch(
          `https://mainnet.zklighter.elliot.ai/api/v1/account?by=l1_address&value=${walletAddress}`
        );

        if (!accountResponse.ok) {
          return createErrorResponse(`HTTP error! status: ${accountResponse.status}`);
        }

        const accountData = await accountResponse.json();
        if (accountData.code !== 200 || accountData.accounts.length === 0) {
          return createErrorResponse("No account found for the given address");
        }

        const accountInfo = accountData.accounts[0];
        const account_index = accountInfo.index;

        const signerClient = new SignerClient({
          url: 'https://mainnet.zklighter.elliot.ai',
          privateKey: private_key,
          accountIndex: account_index,
          apiKeyIndex: api_key_index
        });

        await signerClient.initialize();
        await (signerClient as any).ensureWasmClient();

        const [tx, txHash, err] = await signerClient.cancelOrder({
          marketIndex: market_index,
          orderIndex: order_index
        });

        if (err) {
          logger.error("Cancel order failed", { error: err });
          return createErrorResponse(`Failed to cancel order: ${err}`);
        }

        const orderDetails = {
          transaction: tx,
          transactionHash: txHash,
          ticker: ticker.toUpperCase(),
          marketIndex: market_index,
          orderIndex: order_index,
          action: "CANCEL_ORDER",
          status: "CANCELLED",
          timestamp: new Date().toISOString(),
        };

        logger.toolCompleted("cancel_order");
        return createSuccessResponse(
          `✅ Order cancelled successfully for ${ticker.toUpperCase()}! Transaction Hash: ${txHash}`,
          orderDetails
        );
      } catch (error) {
        return handleToolError("cancel_order", error);
      }
    }
  );

  logger.info("✅ Cancel order tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Cancel order tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
