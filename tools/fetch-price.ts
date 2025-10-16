import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpLogger } from "../utils/logger.js";
import {
  createErrorResponse,
  createSuccessResponse,
  LOG_LEVELS,
} from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { pairsData } from "../utils/pairs-data.js";
import { FetchPriceToolSchema } from "../schema/index.js";

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

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

function getMarketIdFromTicker(ticker: string): number {
  const upperTicker = ticker.toUpperCase();
  const pairData = pairsData[upperTicker as keyof typeof pairsData];
  
  if (!pairData) {
    const availableTickers = Object.keys(pairsData).join(", ");
    throw new Error(`Ticker "${ticker}" not found. Available tickers: ${availableTickers}`);
  }
  
  return pairData.market_id;
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

export function registerFetchPriceTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("💰 Registering fetch price tools...");

  server.tool(
    "fetch_price",
    "Retrieve the current top bid price from Lighter protocol order book for a specific ticker (e.g., ETH, BTC, SOL).",
    FetchPriceToolSchema,
    async ({ ticker, limit = 10 }): Promise<CallToolResult> => {
      try {
        logger.info("Received parameters", { 
          ticker, 
          limit
        });
        
        if (!ticker) {
          return createErrorResponse("Missing required parameter: ticker. Please provide a ticker symbol (e.g., ETH, BTC, SOL)");
        }
        
        logger.toolCalled("fetch_price", { ticker, limit });

        const marketId = getMarketIdFromTicker(ticker);
        
        logger.info("Resolved ticker to market ID", {
          ticker,
          marketId
        });

        const priceData = await fetchOrderBookPrice(marketId, limit);

        const formattedPrice = {
          ticker: ticker.toUpperCase(),
          marketId: priceData.marketId,
          topBidPrice: priceData.price,
          unit: "USDC",
          lastUpdated: new Date().toISOString(),
        };

        logger.toolCompleted("fetch_price");
        return createSuccessResponse(
          `✅ Retrieved top bid price for ${ticker.toUpperCase()}: ${priceData.price} USDC`,
          formattedPrice
        );
      } catch (error) {
        return handleToolError("fetch_price", error);
      }
    }
  );

  logger.info("✅ Fetch price tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Price tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
