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
import { ClosePositionToolSchema } from "../schema/index.js";
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

export function registerClosePositionTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("🔒 Registering close position tools...");

  server.tool(
    "close_position",
    "Close an open position on the Lighter protocol using SignerClient from lighter-ts-sdk. This tool closes an existing position for the specified market.",
    ClosePositionToolSchema,
    async ({
      ticker,
      position_index = -1,
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
          position_index,
          walletAddress,
          api_key_index
        });
        
        if (!ticker) {
          return createErrorResponse("Missing required parameter: ticker. Please provide a ticker symbol (e.g., ETH, BTC, SOL)");
        }
        
        const client_order_index = Date.now();
        
        logger.toolCalled("close_position", {
          ticker,
          position_index,
          client_order_index,
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

        const account = accountInfo;

        if (!account.positions || !Array.isArray(account.positions)) {
          return createErrorResponse("No positions data available");
        }

        const marketPositions = account.positions.filter(
          (pos: any) => pos.market_id === market_index && parseFloat(pos.position) !== 0
        );

        if (marketPositions.length === 0) {
          return createErrorResponse(`No open positions found for ${ticker.toUpperCase()}`);
        }

        logger.info(`Found ${marketPositions.length} open position(s) in market ${market_index}`);

        let positionToClose;
        if (position_index === -1) {
          positionToClose = marketPositions[0];
          logger.info("Closing top position (auto-selected)");
        } else if (position_index < marketPositions.length) {
          positionToClose = marketPositions[position_index];
          logger.info(`Closing position #${position_index + 1}`);
        } else {
          return createErrorResponse(`Position index ${position_index} out of range. Available positions: 0-${marketPositions.length - 1}`);
        }

        if (!positionToClose) {
          return createErrorResponse("No position selected");
        }

        const isLong = positionToClose.sign === 1;
        const positionSize = Math.abs(parseFloat(positionToClose.position));
        const avgPrice = Math.abs(parseFloat(positionToClose.avg_entry_price));

        const baseAmount = Math.floor(positionSize * 1000000);
        const priceInUnits = Math.floor(avgPrice * 100000);

        logger.info(`Closing ${isLong ? 'LONG' : 'SHORT'} position: ${positionSize} units at ${avgPrice} avg price`);

        const [tx, txHash, err] = await signerClient.createMarketOrder({
          marketIndex: market_index,
          clientOrderIndex: client_order_index,
          baseAmount: baseAmount,
          avgExecutionPrice: priceInUnits * 2, 
          isAsk: isLong,
          reduceOnly: true
        });

        const confirmedTx = await signerClient.waitForTransaction(txHash, 60000, 2000);

        if (confirmedTx.status !== "confirmed") {
          return createErrorResponse(`Transaction failed to confirm: ${confirmedTx.status}`);
        }

        if (err) {
          logger.error("Close position failed", { error: err });
          return createErrorResponse(`Failed to close position: ${err}`);
        }

        const positionDetails = {
          transaction: tx,
          transactionHash: txHash,
          ticker: ticker.toUpperCase(),
          marketIndex: market_index,
          clientOrderIndex: client_order_index,
          action: "CLOSE_POSITION",
          status: "SUBMITTED",
          timestamp: new Date().toISOString(),
        };

        logger.toolCompleted("close_position");
        return createSuccessResponse(
          `✅ Position closed successfully for ${ticker.toUpperCase()}! Transaction Hash: ${txHash}`,
          positionDetails
        );
      } catch (error) {
        return handleToolError("close_position", error);
      }
    }
  );

  logger.info("✅ Close position tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Close position tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
