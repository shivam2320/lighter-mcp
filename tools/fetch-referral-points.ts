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

const logger = new McpLogger("ostium-mcp", LOG_LEVELS.INFO);

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
  walletAddress: string,
  authSignature: string,
  accountIndex: number
): Promise<{
  accountIndex: number;
  referralPoints: string;
  walletAddress: string;
}> {
  try {


    const referralResponse = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/referral/points?account_index=${accountIndex}&auth=${authSignature}`,
      {
        headers: {
          'Authorization': `${authSignature}`,
          'accept': 'application/json'
        }
      }
    );


    if (!referralResponse.ok) {
      throw new Error(`HTTP error! status: ${referralResponse.status}`);
    }

    const referralData: LighterReferralPointsResponse = await referralResponse.json();

    if (referralData.code !== 200 || referralData.accounts.length === 0) {
      throw new Error("No referral points found for the given account");
    }

    const referralAccount = referralData.accounts[0];

    return {
      accountIndex: accountIndex,
      referralPoints: referralAccount.referral_points,
      walletAddress: referralAccount.l1_address,
    };
  } catch (error) {
    logger.error("Failed to fetch referral points", {
      walletAddress,
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

        // First fetch account data to get accountIndex
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

        const [authSignature, authError] = await lighterMCP.createAuthTokenWithExpiry(360000, accountIndex); 

        if (authError || !authSignature) {
          return createErrorResponse(authError || "Failed to create authentication signature");
        }

        const referralPoints = await fetchReferralPoints(walletAddress, authSignature, accountIndex);

        const formattedReferralPoints = {
          walletAddress: referralPoints.walletAddress,
          accountIndex: referralPoints.accountIndex,
          referralPoints: referralPoints.referralPoints,
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
