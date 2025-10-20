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
import { CreateLimitOrderToolSchema } from "../schema/index.js";
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

export function registerCreateLimitOrderTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("📊 Registering create limit order tools...");

  server.tool(
    "create_limit_order",
    "Create and execute a limit order on the Lighter protocol using SignerClient from lighter-ts-sdk. This tool creates a limit order transaction, signs it, and submits it to the blockchain.",
    CreateLimitOrderToolSchema,
    async ({
      ticker,
      base_amount,
      price,
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
          price,
          is_ask,
          leverage,
          walletAddress,
          api_key_index
        });
        
        if (!ticker) {
          return createErrorResponse("Missing required parameter: ticker. Please provide a ticker symbol (e.g., ETH, BTC, SOL)");
        }
        
        const client_order_index = Date.now();
        
        logger.toolCalled("create_limit_order", {
          ticker,
          client_order_index,
          base_amount,
          price,
          is_ask,
          walletAddress,
          api_key_index,
        });

        const market_index = getMarketIdFromTicker(ticker);
        
        logger.info("Resolved ticker to market ID", {
          ticker,
          market_index
        });

        const { priceScale, amountScale } = getScalesForTicker(ticker);
        const scaledPrice = Math.floor(price * priceScale);
        const scaledBaseAmount = Math.floor(base_amount * amountScale);

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

        const [tx, txHash, err] = await signerClient.createOrder({
          marketIndex: market_index,
          clientOrderIndex: client_order_index,
          baseAmount: scaledBaseAmount,
          price: scaledPrice,
          isAsk: is_ask,
          timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME
        });

        if (err) {
          logger.error("Limit order failed", { error: err });
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
          baseAmount: scaledBaseAmount,
          price: scaledPrice,
          isAsk: is_ask,
          leverage: leverage,
          orderType: "LIMIT",
          timeInForce: "GOOD_TILL_TIME",
          status: "SUBMITTED",
          timestamp: new Date().toISOString(),
          priceScale,
          amountScale
        };

        logger.toolCompleted("create_limit_order");
        return createSuccessResponse(
          `✅ Limit order created successfully for ${ticker.toUpperCase()} at ${scaledPrice} scaled units (scale ${priceScale}). Transaction Hash: ${txHash}`,
          orderDetails
        );
      } catch (error) {
        return handleToolError("create_limit_order", error);
      }
    }
  );

  logger.info("✅ Create limit order tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Limit order tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
