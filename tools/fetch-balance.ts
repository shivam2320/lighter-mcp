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

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

interface LighterApiResponse {
  code: number;
  total: number;
  accounts: Array<{
    available_balance: string;
    l1_address: string;
  }>;
}

async function fetchBalances(walletAddress: string): Promise<{
  availableBalance: string;
  walletAddress: string;
}> {
  try {
    const url = `https://mainnet.zklighter.elliot.ai/api/v1/account?by=l1_address&value=${encodeURIComponent(walletAddress)}`;
    
    logger.info("Making API request", {
      url,
      walletAddress
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
        
        if (errorBody.includes('"code":21100') && errorBody.includes('"account not found"')) {
          throw new Error("No Lighter account found for this wallet address. The wallet may not be registered on the Lighter protocol yet.");
        }
      } catch (e) {
        logger.error("Could not read error response body", { error: e });
      }
      
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}. Body: ${errorBody}`);
    }

    const data: LighterApiResponse = await response.json();
    
    logger.info("API response data", { data });

    if (data.code !== 200 || data.accounts.length === 0) {
      throw new Error("No account found for the given address");
    }

    const account = data.accounts[0];

    return {
      availableBalance: account.available_balance,
      walletAddress: account.l1_address,
    };
  } catch (error) {
    logger.error("Failed to fetch balances", {
      walletAddress,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function registerFetchBalancesTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("💰 Registering fetch balances tools...");

  server.tool(
    "fetch_wallet_balances",
    "Retrieve account balance for the current user's wallet address from Lighter protocol. Returns the available balance in USDC.",
    {
      type: "object",
      properties: {},
      required: [],
    },
    async (): Promise<CallToolResult> => {
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
        
        logger.info("Using wallet from session", {
          sessionId: context.sessionId,
          wallet: wallet,
          walletToSession: lighterMCP.walletToSession
        });

        const client = new EVMWalletClient(
          lighterMCP.hubBaseUrl,
          token.access_token,
          context.deploymentId
        );

        const account = await client.getViemAccount(wallet, "evm:eip155:8453");
        if (!account) {
          return createErrorResponse(
            "No account found, you need to choose a wallet first with chooseWallet"
          );
        }

        const walletAddress = account.address;
        
        logger.info("Retrieved wallet address", {
          originalAddress: walletAddress,
          addressLength: walletAddress.length,
          isChecksummed: walletAddress === walletAddress.toLowerCase() || walletAddress === walletAddress.toUpperCase()
        });

        logger.toolCalled("fetch_wallet_balances", { walletAddress });

        try {
          const balances = await fetchBalances(walletAddress);

          const formattedBalances = {
            walletAddress: balances.walletAddress,
            balance: balances.availableBalance,
            unit: "USDC",
            lastUpdated: new Date().toISOString(),
          };

          logger.toolCompleted("fetch_wallet_balances");
          return createSuccessResponse(
            `✅ Retrieved Lighter protocol balances for wallet ${walletAddress}`,
            formattedBalances
          );
        } catch (error) {
          if (error instanceof Error && error.message.includes("No Lighter account found")) {
            logger.info("No Lighter account found for wallet", { walletAddress });
            return createSuccessResponse(
              `ℹ️ No Lighter protocol account found for wallet ${walletAddress}. The wallet may not be registered on the Lighter protocol yet.`,
              {
                walletAddress,
                balance: "0",
                unit: "USDC",
                status: "No account found",
                message: "This wallet address doesn't have a Lighter protocol account yet."
              }
            );
          }
          throw error;
        }
      } catch (error) {
        return handleToolError("fetch_wallet_balances", error);
      }
    }
  );

  logger.info("✅ Fetch balances tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Balance tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}