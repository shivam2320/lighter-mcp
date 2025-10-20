import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHelloTool } from './tools/hello-world.js';
import { registerHelloPrompt } from './prompts/hello-world.js';
import { registerHelloResource } from './resources/hello-world.js';
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAuthContext } from '@osiris-ai/sdk';
import { createErrorResponse, createSuccessResponse } from './utils/types.js';
import z from 'zod';
import { registerFetchBalancesTools } from './tools/fetch-balance.js';
import { registerFetchFundingRatesTools } from './tools/fetch-funding-rates.js';
import { registerFetchReferralPointsTools } from './tools/fetch-referral-points.js';
import { registerFetchPriceTools } from './tools/fetch-price.js';
import { registerCreateMarketOrderTools } from './tools/create-market-order.js';
import { registerCreateLimitOrderTools } from './tools/create-limit-order.js';
import { registerClosePositionTools } from './tools/close-position.js';
import { registerCancelOrderTools } from './tools/cancel-order.js';
import { registerGetPositionsTools } from './tools/get-positions.js';
import { registerAddTpSlOrdersTools } from './tools/add-tp-sl-orders.js';
import { registerSystemSetupTools } from './tools/system-setup.js';
import { registerDepositTools } from './tools/deposit.js';
import { registerWithdrawTools } from './tools/withdraw.js';
import { PublicClient, createPublicClient, erc20Abi, http, parseUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { createWalletClient, serializeTransaction, encodeFunctionData } from 'viem';
import { USDC_CONTRACT_ADDRESS, LIGHTER_DEPOSIT_CONTRACT_ADDRESS } from './utils/constants.js';

export class LighterMCP {
  public hubBaseUrl: string;
  publicClient: PublicClient;
  walletToSession: Record<string, string> = {};

  constructor(hubBaseUrl: string) {
    this.hubBaseUrl = hubBaseUrl;
    this.publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(),
    }) as PublicClient;
  }


  async getUserAddresses(): Promise<CallToolResult> {
    try {
      const { token, context } = getAuthContext("osiris");
      if (!token || !context) {
        throw new Error("No token or context found");
      }

      const client = new EVMWalletClient(
        this.hubBaseUrl,
        token.access_token,
        context.deploymentId
      );
      const walletRecords = await client.getWalletRecords();
      if (walletRecords.length === 0) {
        throw new Error("No wallet record found");
      }

      const addresses = walletRecords.map((walletRecord) =>
        walletRecord.accounts.addresses.map((address) => ({
          chains: address.chains,
          address: address.address,
        }))
      );
      return createSuccessResponse("Successfully got user addresses", {
        addresses,
      });
    } catch (error: any) {
      console.error("Failed to get user addresses", error);
      const errorMessage = error.message || "Failed to get user addresses";
      return createErrorResponse(errorMessage);
    }
  }

  async chooseWallet(address: string): Promise<CallToolResult> {
    try {
      const { token, context } = getAuthContext("osiris");
      if (!token || !context) {
        throw new Error("No token or context found");
      }
      const client = new EVMWalletClient(
        this.hubBaseUrl,
        token.access_token,
        context.deploymentId
      );
      const walletRecords = await client.getWalletRecords();
      if (walletRecords.length === 0) {
        throw new Error("No wallet record found");
      }
      const walletRecord = walletRecords.find((walletRecord) =>
        walletRecord.accounts.addresses.some(
          (_address) => _address.address.toLowerCase() === address.toLowerCase()
        )
      );
      if (!walletRecord) {
        throw new Error("Wallet record not found");
      }
      this.walletToSession[context.sessionId] = address;

      return createSuccessResponse("Successfully chose wallet", {
        walletRecordId: walletRecord.id,
      });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to choose wallet";
      return createErrorResponse(errorMessage);
    }
  }

  async withdraw(amount: string, retry = false): Promise<CallToolResult> {

		try {
			const { token, context } = getAuthContext("osiris");
			if (!token || !context) {
				throw new Error("No token or context found");
			}

			const wallet = this.walletToSession[context.sessionId];
			if (!wallet) {
				throw new Error(
					"No wallet found, you need to choose a wallet first with chooseWallet"
				);
			}

			const client = new EVMWalletClient(
				this.hubBaseUrl,
				token.access_token,
				context.deploymentId
			);

			const account = await client.getViemAccount(wallet, "evm:eip155:42161");
			if (!account) {
				throw new Error(
					"No account found, you need to choose a wallet first with chooseWallet"
				);
			}

			const walletClient = createWalletClient({
				account: account,
				chain: arbitrum,
				transport: http(),
			});

			let serializedTransaction: any;

				const preparedTx = await walletClient.prepareTransactionRequest({
					to: USDC_CONTRACT_ADDRESS,
					abi: erc20Abi,
					functionName: "transfer",
					args: [LIGHTER_DEPOSIT_CONTRACT_ADDRESS, parseUnits(amount, 6)],
					gas: 800000n,
				});
				serializedTransaction = serializeTransaction({
					...preparedTx,
					data: encodeFunctionData({
						abi: erc20Abi,
						functionName: "transfer",
						args: [LIGHTER_DEPOSIT_CONTRACT_ADDRESS as `0x${string}`, parseUnits(amount, 6)],
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

			const receipt = await this.publicClient.waitForTransactionReceipt({
				hash: hash,
			});

			if (receipt.status !== "success") {
				throw new Error(`Transaction failed with status: ${receipt.status}`);
			}

			return createSuccessResponse("Successfully withdrew token", {
				hash: hash,
				amount: amount,
				receipt: receipt,
			});
		} catch (error: any) {
			if (retry) {
				throw new Error(error.message || "Failed to withdraw token, and failed to refresh token, reauthenticate with this MCP");
			}
			throw new Error(error.message || "Failed to withdraw token");
		}
	}

  configureServer(server: McpServer): void {
    registerHelloTool(server);
    registerHelloPrompt(server);
    registerHelloResource(server);
    registerFetchBalancesTools(server, this);
    registerFetchFundingRatesTools(server, this);
    registerFetchReferralPointsTools(server, this);
    registerFetchPriceTools(server, this);
    registerCreateMarketOrderTools(server, this);
    registerCreateLimitOrderTools(server, this);
    registerClosePositionTools(server, this);
    registerCancelOrderTools(server, this);
    registerGetPositionsTools(server, this);
    registerAddTpSlOrdersTools(server, this);
    registerSystemSetupTools(server, this);
    registerDepositTools(server, this);
    registerWithdrawTools(server, this);
    server.tool(
      "getUserAddresses",
      "Get user addresses, you can choose a wallet with chooseWallet",
      {},
      async () => {
        const addresses = await this.getUserAddresses();
        return addresses;
      }
    );
    server.tool(
      "chooseWallet",
      "Choose a wallet, you can get user addresses with getUserAddresses",
      {
        address: z.string(),
      },
      async ({ address }) => {
        const wallet = await this.chooseWallet(address as string);
        return wallet;
      }
    );
  }
}
