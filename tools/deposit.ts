import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getAuthContext } from "@osiris-ai/sdk";
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { McpLogger } from "../utils/logger.js";
import { createErrorResponse, createSuccessResponse, LOG_LEVELS } from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { DepositToolSchema } from "../schema/index.js";
import { PublicClient, createPublicClient, erc20Abi, http, parseUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { createWalletClient, serializeTransaction, encodeFunctionData } from 'viem';
import { USDC_CONTRACT_ADDRESS, LIGHTER_DEPOSIT_CONTRACT_ADDRESS } from '../utils/constants.js';

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

export function registerDepositTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("💳 Registering deposit tools...");

  server.tool(
    "deposit",
    "Deposit USDC to the Lighter deposit contract from the selected wallet",
    DepositToolSchema,
    async ({ amount }): Promise<CallToolResult> => {
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

        const account = await client.getViemAccount(wallet, "evm:eip155:42161");
        if (!account) {
          return createErrorResponse(
            "No account found, you need to choose a wallet first with chooseWallet"
          );
        }

        const walletClient = createWalletClient({
          account: account,
          chain: arbitrum,
          transport: http(),
        });

        const preparedTx = await walletClient.prepareTransactionRequest({
          to: USDC_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "transfer",
          args: [LIGHTER_DEPOSIT_CONTRACT_ADDRESS, parseUnits(amount as string, 6)],
          gas: 800000n,
        });
        const serializedTransaction = serializeTransaction({
          ...preparedTx,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [LIGHTER_DEPOSIT_CONTRACT_ADDRESS as `0x${string}`, parseUnits(amount as string, 6)],
          }),
        } as any);

        const signedTx = await client.signTransaction(
          erc20Abi,
          serializedTransaction,
          "evm:eip155:42161",
          account.address
        );
        const hash = await walletClient.sendRawTransaction({
          serializedTransaction: signedTx as `0x${string}`,
        });

        const receipt = await lighterMCP.publicClient.waitForTransactionReceipt({
          hash,
        });

        if (receipt.status !== "success") {
          return createErrorResponse(`Transaction failed with status: ${receipt.status}`);
        }

        logger.toolCompleted("deposit");
        return createSuccessResponse("Successfully deposited token", {
          hash,
          amount,
          receipt,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  logger.info("✅ Deposit tools registered successfully");
}


