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
import { AddTpSlOrdersToolSchema } from "../schema/index.js";
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

function getScalesForTicker(ticker: string): { priceScale: number; amountScale: number } {
  const upperTicker = ticker.toUpperCase();
  const pairData = pairsData[upperTicker as keyof typeof pairsData] as any;
  const priceScale = pairData?.price_scale ?? 1000;
  const amountScale = pairData?.amount_scale ?? 1000;
  return { priceScale, amountScale };
}

export function registerAddTpSlOrdersTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("📊 Registering add TP/SL orders tools...");

  server.tool(
    "add_tp_sl_orders",
    "Add Take Profit (TP) and Stop Loss (SL) orders to an existing position. This tool creates limit orders that will automatically close the position when the specified price levels are reached.",
    AddTpSlOrdersToolSchema,
    async ({
      ticker,
      position_index = -1,
      take_profit_price,
      stop_loss_price,
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
          take_profit_price,
          stop_loss_price,
          walletAddress,
          api_key_index
        });
        
        if (!ticker) {
          return createErrorResponse("Missing required parameter: ticker. Please provide a ticker symbol (e.g., ETH, BTC, SOL)");
        }
        
        const client_order_index = Date.now();
        
        logger.toolCalled("add_tp_sl_orders", {
          ticker,
          client_order_index,
          position_index,
          take_profit_price,
          stop_loss_price,
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

        const positions = accountInfo.positions || [];
        const positionsWithValue = positions.filter((pos: any) => 
          parseFloat(pos.position_value) > 0 && pos.market_id === market_index
        );

        if (positionsWithValue.length === 0) {
          return createErrorResponse(`No positions found for ${ticker.toUpperCase()}. Please open a position first.`);
        }

        let selectedPosition;
        if (position_index === -1) {
          selectedPosition = positionsWithValue[0];
        } else {
          selectedPosition = positionsWithValue[position_index];
          if (!selectedPosition) {
            return createErrorResponse(`Position index ${position_index} not found. Available positions: 0-${positionsWithValue.length - 1}`);
          }
        }

        const isLongPosition = selectedPosition.sign === 1;
        const positionSize = parseFloat(selectedPosition.position);
        
        logger.info("Selected position details", {
          positionSize,
          isLongPosition,
          avgEntryPrice: selectedPosition.avg_entry_price,
          positionValue: selectedPosition.position_value
        });

        const signerClient = new SignerClient({
          url: 'https://mainnet.zklighter.elliot.ai',
          privateKey: private_key,
          accountIndex: account_index,
          apiKeyIndex: api_key_index
        });

        await signerClient.initialize();
        await (signerClient as any).ensureWasmClient();

        const results: any = {
          ticker: ticker.toUpperCase(),
          marketIndex: market_index,
          positionIndex: position_index === -1 ? 0 : position_index,
          positionSize,
          isLongPosition,
          orders: []
        };

        const { priceScale, amountScale } = getScalesForTicker(ticker);
        const baseAmount = Math.floor(Math.abs(positionSize) * amountScale);

        if (take_profit_price && take_profit_price > 0) {
          logger.info("📈 Creating Take Profit Limit Order...");
          
          const tpIsAsk = isLongPosition;
          
          const tpTrigger = Math.floor(take_profit_price * priceScale);
          const tpLimit = tpTrigger;

          const [tpTx, tpTxHash, tpErr] = await signerClient.createTpLimitOrder(
            market_index,
            client_order_index,
            baseAmount,
            tpTrigger, 
            tpLimit, 
            tpIsAsk, 
            true 
          );

          if (tpErr) {
            logger.error("Take Profit order failed", { error: tpErr });
            return createErrorResponse(`Take Profit order failed: ${tpErr}`);
          }

          results.orders.push({
            type: "TAKE_PROFIT",
            transaction: tpTx,
            transactionHash: tpTxHash,
            price: tpLimit,
            isAsk: tpIsAsk,
            status: "SUBMITTED"
          });

          logger.info("Take Profit order created successfully", { tpTxHash });
        }

        // Create Stop Loss order if specified
        if (stop_loss_price && stop_loss_price > 0) {
          logger.info("🛡️ Creating Stop Loss Limit Order...");
          
          const slIsAsk = isLongPosition;
          
          const slTrigger = Math.floor(stop_loss_price * priceScale);
          const slLimit = slTrigger;

          const [slTx, slTxHash, slErr] = await signerClient.createSlLimitOrder(
            market_index,
            client_order_index + 1,
            baseAmount,
            slTrigger, 
            slLimit, 
            slIsAsk, 
            true 
          );

          if (slErr) {
            logger.error("Stop Loss order failed", { error: slErr });
            return createErrorResponse(`Stop Loss order failed: ${slErr}`);
          }

          results.orders.push({
            type: "STOP_LOSS",
            transaction: slTx,
            transactionHash: slTxHash,
            price: slLimit,
            isAsk: slIsAsk,
            status: "SUBMITTED"
          });

          logger.info("Stop Loss order created successfully", { slTxHash });
        }

        if (results.orders.length === 0) {
          return createErrorResponse("No orders created. Please specify at least one of take_profit_price or stop_loss_price.");
        }

        const orderTypes = results.orders.map((order: any) => order.type).join(" and ");
        const orderHashes = results.orders.map((order: any) => order.transactionHash).join(", ");

        logger.toolCompleted("add_tp_sl_orders");
        return createSuccessResponse(
          `✅ ${orderTypes} orders created successfully for ${ticker.toUpperCase()} position! Transaction Hashes: ${orderHashes}`,
          results
        );
      } catch (error) {
        return handleToolError("add_tp_sl_orders", error);
      }
    }
  );

  logger.info("✅ Add TP/SL orders tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("TP/SL orders tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
