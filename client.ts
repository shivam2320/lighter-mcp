import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHelloTool } from './tools/hello-world.js';
import { registerHelloPrompt } from './prompts/hello-world.js';
import { registerHelloResource } from './resources/hello-world.js';
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAuthContext } from '@osiris-ai/sdk';
import { createErrorResponse, createSuccessResponse } from './utils/types.js';
import { createAuthTokenWithExpiry as createAuthToken } from './utils/auth.js';
import z from 'zod';
import { registerFetchBalancesTools } from './tools/fetch-balance.js';
import { registerFetchFundingRatesTools } from './tools/fetch-funding-rates.js';
import { registerFetchReferralPointsTools } from './tools/fetch-referral-points.js';
import { registerFetchPriceTools } from './tools/fetch-price.js';
import { registerCreateMarketOrderTools } from './tools/create-market-order.js';
import { PublicClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
// import { base } from 'viem/chains';

export class LighterMCP {
  public hubBaseUrl: string;
  publicClient: PublicClient;
  walletToSession: Record<string, string> = {};

  constructor(hubBaseUrl: string) {
    this.hubBaseUrl = hubBaseUrl;
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(),
    }) as PublicClient;
  }

  async createAuthTokenWithExpiry(expiry: number, accountIndex: number): Promise<[string, string | null]> {
    return createAuthToken(this.hubBaseUrl, this.walletToSession, expiry, accountIndex);
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

  configureServer(server: McpServer): void {
    registerHelloTool(server);
    registerHelloPrompt(server);
    registerHelloResource(server);
    registerFetchBalancesTools(server, this);
    registerFetchFundingRatesTools(server, this);
    registerFetchReferralPointsTools(server, this);
    registerFetchPriceTools(server, this);
    registerCreateMarketOrderTools(server, this);
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
