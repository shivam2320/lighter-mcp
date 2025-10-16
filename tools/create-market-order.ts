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
import { CreateMarketOrderToolSchema } from "../schema/index.js";
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

interface OrderBookOrder {
  order_index: number;
  order_id: string;
  owner_account_index: number;
  initial_base_amount: string;
  remaining_base_amount: string;
  price: string;
  order_expiry: number;
}

interface OrderBookApiResponse {
  code: number;
  total_asks: number;
  asks: OrderBookOrder[];
  total_bids: number;
  bids: OrderBookOrder[];
}

async function fetchOrderBookPrice(marketId: number, limit: number = 10): Promise<{
  price: string;
  marketId: number;
}> {
  try {
    const url = `https://mainnet.zklighter.elliot.ai/api/v1/orderBookOrders?market_id=${marketId}&limit=${limit}`;
    
    logger.info("Making API request", {
      url,
      marketId,
      limit
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    logger.info("API response received", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        logger.error("API error response body", { errorBody });
      } catch (e) {
        logger.error("Could not read error response body", { error: e });
      }
      
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}. Body: ${errorBody}`);
    }

    const data: OrderBookApiResponse = await response.json();
    
    logger.info("API response data", { data });

    if (data.code !== 200) {
      throw new Error("Failed to fetch order book data");
    }

    if (!data.bids || data.bids.length === 0) {
      throw new Error("No bids found in order book");
    }

    const topBidPrice = data.bids[0].price;

    return {
      price: topBidPrice,
      marketId: marketId,
    };
  } catch (error) {
    logger.error("Failed to fetch order book price", {
      marketId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function registerCreateMarketOrderTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("📈 Registering create market order tools...");

  server.tool(
    "create_market_order",
    "Create and execute a market order on the Lighter protocol using SignerClient from lighter-ts-sdk. This tool creates a market order transaction, signs it, and submits it to the blockchain.",
    CreateMarketOrderToolSchema,
    async ({
      ticker,
      base_amount,
      is_ask,
      leverage = 10,
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
          base_amount,
          is_ask,
          leverage,
          walletAddress,
          api_key_index
        });
        
        if (!ticker) {
          return createErrorResponse("Missing required parameter: ticker. Please provide a ticker symbol (e.g., ETH, BTC, SOL)");
        }
        
        const client_order_index = Date.now();
        
        logger.toolCalled("create_market_order", {
          ticker,
          client_order_index,
          base_amount,
          is_ask,
          walletAddress,
          api_key_index,
        });

        const market_index = getMarketIdFromTicker(ticker);
        
        logger.info("Resolved ticker to market ID", {
          ticker,
          market_index
        });

        const priceData = await fetchOrderBookPrice(market_index);
        const avg_execution_price = Math.floor(parseFloat(priceData.price) * 100); // Convert to cents
        console.log("avg_execution_price", avg_execution_price);
        
        logger.info("Fetched current market price", {
          ticker,
          marketPrice: priceData.price,
          avgExecutionPrice: avg_execution_price
        });

        // Get account index from wallet address
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

        logger.info(`Updating leverage to ${leverage}x for market ${market_index}`);

        const [leverageTx, leverageTxHash, leverageErr] = await signerClient.updateLeverage(
          market_index,
          SignerClient.CROSS_MARGIN_MODE,
          10000/leverage
        );

        if (leverageErr) {
          logger.error("Leverage update failed", { error: leverageErr });
          return createErrorResponse(`Failed to update leverage: ${leverageErr}`);
        }

        logger.info("Leverage updated successfully", { leverageTxHash });

        const [tx, txHash, err] = await signerClient.createMarketOrder({
          marketIndex: market_index,
          clientOrderIndex: client_order_index,
          baseAmount: base_amount,
          avgExecutionPrice: avg_execution_price,
          isAsk: is_ask
        });

        if (err) {
          logger.error("Market order failed", { error: err });
          return createErrorResponse(`Order failed: ${err}`);
        }

        const orderDetails = {
          transaction: tx,
          transactionHash: txHash,
          leverageTransaction: leverageTx,
          leverageTransactionHash: leverageTxHash,
          ticker: ticker.toUpperCase(),
          marketIndex: market_index,
          clientOrderIndex: client_order_index,
          baseAmount: base_amount,
          marketPrice: priceData.price,
          avgExecutionPrice: avg_execution_price,
          isAsk: is_ask,
          leverage: leverage,
          orderType: "MARKET",
          timeInForce: "IMMEDIATE_OR_CANCEL",
          status: "SUBMITTED",
          timestamp: new Date().toISOString(),
        };

        logger.toolCompleted("create_market_order");
        return createSuccessResponse(
          `✅ Market order created successfully for ${ticker.toUpperCase()} at ${priceData.price} USDC! Transaction Hash: ${txHash}`,
          orderDetails
        );
      } catch (error) {
        return handleToolError("create_market_order", error);
      }
    }
  );

  logger.info("✅ Create market order tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Market order tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
