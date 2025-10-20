import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpLogger } from "../utils/logger.js";
import { createErrorResponse, createSuccessResponse, LOG_LEVELS } from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { WithdrawToolSchema } from "../schema/index.js";
import { getAuthContext } from "@osiris-ai/sdk";
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { SignerClient } from "lighter-ts-sdk";
import { parseUnits } from "viem";

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

export function registerWithdrawTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("🏧 Registering withdraw tools...");

  server.tool(
    "withdraw",
    "Withdraw USDC from Lighter using SignerClient (amount is human USDC, 6 decimals)",
    WithdrawToolSchema,
    async ({ amount, private_key, api_key_index = 0 }): Promise<CallToolResult> => {
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
        const account_index = accountData.accounts[0].index;

        const signerClient = new SignerClient({
          url: 'https://mainnet.zklighter.elliot.ai',
          privateKey: private_key as string,
          accountIndex: account_index,
          apiKeyIndex: api_key_index as number
        });

        await signerClient.initialize();
        await (signerClient as any).ensureWasmClient();

        const humanAmount = amount as string;
        if (!humanAmount || isNaN(Number(humanAmount))) {
          return createErrorResponse("Invalid amount provided");
        }

        const [withdrawInfo, txHash, err] = await signerClient.withdraw(Number(humanAmount));
        if (err) {
          return createErrorResponse(`Withdraw failed: ${err}`);
        }

        const tx = await signerClient.waitForTransaction(txHash, 60000, 2000);
        const isConfirmed = (
          tx.status === (SignerClient as any).TX_STATUS_EXECUTED ||
          tx.status === (SignerClient as any).TX_STATUS_COMMITTED
        );
        if (!isConfirmed) {
          return createErrorResponse(`Transaction failed to confirm: ${tx.status}`);
        }

        logger.toolCompleted("withdraw");
        return createSuccessResponse(
          `✅ Withdraw submitted successfully`,
          { txHash, withdrawInfo, amount: humanAmount }
        );
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  logger.info("✅ Withdraw tools registered successfully");
}


