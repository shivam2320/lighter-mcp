import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpLogger } from "../utils/logger.js";
import {
  createErrorResponse,
  createSuccessResponse,
  LOG_LEVELS,
} from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { AccountApi, ApiClient } from "lighter-ts-sdk";

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

interface FundingRate {
  market_id: number;
  exchange: string;
  symbol: string;
  rate: number;
}

interface FundingRatesApiResponse {
  code: number;
  funding_rates: FundingRate[];
}

async function fetchFundingRates(): Promise<FundingRate[]> {
  try {
    const response = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/funding-rates"
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: FundingRatesApiResponse = await response.json();

    if (data.code !== 200) {
      throw new Error("Failed to fetch funding rates");
    }

    const lighterRates = data.funding_rates.filter(
      (rate) => rate.exchange === "lighter"
    );

    return lighterRates;
  } catch (error) {
    logger.error("Failed to fetch funding rates", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function registerFetchFundingRatesTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("📊 Registering fetch funding rates tools...");

  server.tool(
    "fetch_funding_rates",
    "Retrieve current funding rates from Lighter protocol. Returns symbol and rate for all Lighter exchange markets.",
    {
      type: "object",
      properties: {},
      required: [],
    },
    async (): Promise<CallToolResult> => {
      try {
        logger.toolCalled("fetch_funding_rates");

        const fundingRates = await fetchFundingRates();

        const formattedRates = fundingRates.map((rate) => ({
          symbol: rate.symbol,
          rate: rate.rate,
        }));

        logger.toolCompleted("fetch_funding_rates");
        return createSuccessResponse(
          `✅ Retrieved ${formattedRates.length} funding rates from Lighter protocol`,
          formattedRates
        );
      } catch (error) {
        return handleToolError("fetch_funding_rates", error);
      }
    }
  );

  logger.info("✅ Fetch funding rates tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Funding rates tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
