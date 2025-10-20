import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getAuthContext } from "@osiris-ai/sdk";
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { McpLogger } from "../utils/logger.js";
import { createErrorResponse, createSuccessResponse, LOG_LEVELS } from "../utils/types.js";
import { LighterMCP } from "../client.js";
import { DepositEthereumToolSchema } from "../schema/index.js";
import { PublicClient, createPublicClient, http, parseUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { createWalletClient, serializeTransaction, encodeFunctionData } from 'viem';
import { ZKLIGHTER_CONTRACT_ADDRESS } from '../utils/constants.js';
import { ZKLIGHTER_ABI } from '../utils/ABIs/ZKLIGHTER_ABI.js';

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);

export function registerDepositEthereumTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("💳 Registering deposit ethereum tools...");

  server.tool(
    "deposit-ethereum",
    "Deposit Ethereum to the ZkLighter contract from the selected wallet",
    DepositEthereumToolSchema,
    async ({ amount, address }): Promise<CallToolResult> => {
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

        const account = await client.getViemAccount(wallet, "evm:eip155:1");
        if (!account) {
          return createErrorResponse(
            "No account found, you need to choose a wallet first with chooseWallet"
          );
        }

        const walletClient = createWalletClient({
          account: account,
          chain: mainnet,
          transport: http(),
        });

        const amount_usdc = parseUnits(amount as string, 6);

        const preparedTx = await walletClient.prepareTransactionRequest({
          to: ZKLIGHTER_CONTRACT_ADDRESS,
          abi: ZKLIGHTER_ABI,
          functionName: "deposit",
          args: [amount_usdc, address as `0x${string}`],
          gas: 800000n,
          value: amount_usdc, 
        });

        const serializedTransaction = serializeTransaction({
          ...preparedTx,
          data: encodeFunctionData({
            abi: ZKLIGHTER_ABI,
            functionName: "deposit",
            args: [amount_usdc, address as `0x${string}`],
          }),
          value: amount_usdc,
        } as any);

        const signedTx = await client.signTransaction(
          ZKLIGHTER_ABI,
          serializedTransaction,
          "evm:eip155:1",
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

        logger.toolCompleted("deposit-ethereum");
        return createSuccessResponse("Successfully deposited Ethereum", {
          hash,
          amount,
          address,
          receipt,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  logger.info("✅ Deposit ethereum tools registered successfully");
}

