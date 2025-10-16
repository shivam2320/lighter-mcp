import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getAuthContext } from "@osiris-ai/sdk";
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { SignerClient, ApiClient } from "lighter-ts-sdk";
import { McpLogger } from "../utils/logger.js";
import {
  createErrorResponse,
  createSuccessResponse,
  LOG_LEVELS,
} from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { FetchReferralPointsToolSchema } from "../schema/index.js";

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

interface LighterReferralPointsResponse {
  code: number;
  total: number;
  accounts: Array<{
    index: number;
    referral_points: string;
    l1_address: string;
  }>;
}

async function fetchReferralPoints(
  accountIndex: number,
  privateKey: string,
  apiKeyIndex: number = 0
): Promise<{
  accountIndex: number;
  referralPoints: string;
  walletAddress: string;
}> {
  try {
    if (!privateKey) {
      throw new Error("Private key is required");
    }

    const signerClient = new SignerClient({
      url: 'https://mainnet.zklighter.elliot.ai',
      privateKey: privateKey,
      accountIndex: accountIndex,
      apiKeyIndex: apiKeyIndex
    });

    await signerClient.initialize();
    await (signerClient as any).ensureWasmClient();

    const authToken = await signerClient.createAuthTokenWithExpiry(600); // 10 minutes

    const apiClient = new ApiClient({
      host: 'https://mainnet.zklighter.elliot.ai'
    });

    apiClient.setDefaultHeader('authorization', authToken);
    apiClient.setDefaultHeader('Authorization', authToken);

    const response = await apiClient.get('/api/v1/referral/points', {
      account_index: accountIndex
    });

    const referralData: LighterReferralPointsResponse = response.data;

    if (referralData.code !== 200 || referralData.accounts.length === 0) {
      return {
        accountIndex: accountIndex,
        referralPoints: "0",
        walletAddress: "",
      };
    }

    const referralAccount = referralData.accounts[0];

    return {
      accountIndex: accountIndex,
      referralPoints: referralAccount.referral_points,
      walletAddress: referralAccount.l1_address,
    };
  } catch (error) {
    logger.error("Failed to fetch referral points", {
      accountIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function registerFetchReferralPointsTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("🎯 Registering fetch referral points tools...");

  server.tool(
    "fetch_referral_points",
    "Retrieve referral points for the current user's wallet address from Lighter protocol. Returns the referral points earned by the user.",
    FetchReferralPointsToolSchema,
    async ({ private_key, api_key_index = 0 }): Promise<CallToolResult> => {
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

        const account = await client.getViemAccount(wallet, "evm:eip155:8453");
        if (!account) {
          return createErrorResponse(
            "No account found, you need to choose a wallet first with chooseWallet"
          );
        }

        const walletAddress = account.address;

        logger.toolCalled("fetch_referral_points", { walletAddress });

        const accountResponse = await fetch(
          `https://mainnet.zklighter.elliot.ai/api/v1/account?by=l1_address&value=${walletAddress}`
        );

        if (!accountResponse.ok) {
          return createErrorResponse(`HTTP error! status: ${accountResponse.status}`);
        }

        const accountData: LighterReferralPointsResponse = await accountResponse.json();

        if (accountData.code !== 200 || accountData.accounts.length === 0) {
          return createErrorResponse("No account found for the given address");
        }

        const accountInfo = accountData.accounts[0];
        const accountIndex = accountInfo.index;

        const referralPoints = await fetchReferralPoints(accountIndex, private_key, api_key_index);

        const finalWalletAddress = referralPoints.walletAddress || walletAddress;

        const formattedReferralPoints = {
          referrals: [],
          user_total_points: parseInt(referralPoints.referralPoints) || 0,
          user_last_week_points: 0,
          user_total_referral_reward_points: parseInt(referralPoints.referralPoints) || 0,
          user_last_week_referral_reward_points: 0,
          reward_point_multiplier: "0.1000",
          walletAddress: finalWalletAddress,
          accountIndex: referralPoints.accountIndex,
          lastUpdated: new Date().toISOString(),
        };

        logger.toolCompleted("fetch_referral_points");
        return createSuccessResponse(
          `✅ Retrieved Lighter protocol referral points for wallet ${walletAddress}`,
          formattedReferralPoints
        );
      } catch (error) {
        return handleToolError("fetch_referral_points", error);
      }
    }
  );

  logger.info("✅ Fetch referral points tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("Referral points tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}
