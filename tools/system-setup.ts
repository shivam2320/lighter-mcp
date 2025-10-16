import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getAuthContext } from "@osiris-ai/sdk";
import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { SignerClient } from 'lighter-ts-sdk';
import { McpLogger } from "../utils/logger.js";
import {
  createErrorResponse,
  createSuccessResponse,
  LOG_LEVELS,
} from "../utils/types.js";
import { LighterMCP } from "../client.js";

const logger = new McpLogger("lighter-mcp", LOG_LEVELS.INFO);


async function changeApiKey(
  signerClient: SignerClient,
  walletToSession: Record<string, string>,
  hubBaseUrl: string,
  params: {
    newPubkey: string;
    newApiKeyIndex?: number;
  }
): Promise<[any, string, string | null]> {
  try {
    const { token, context } = getAuthContext("osiris");
    if (!token || !context) {
        throw new Error("No token or context found");
    }

    const wallet = walletToSession[context.sessionId];

    if (!wallet) {
        const error = new Error(
        "No wallet found, you need to choose a wallet first with chooseWallet"
        );
        error.name = "NoWalletFoundError";
        return [null, '', error.message];
    }
    const newApiKeyIndex = params.newApiKeyIndex ?? ((signerClient as any).config.apiKeyIndex + 1);
    
    const nonce = 0;

    const nonceHex = '0x' + nonce.toString(16).padStart(16, '0');
    const accountIndexHex = '0x' + (signerClient as any).config.accountIndex.toString(16).padStart(16, '0');
    const newApiKeyIndexHex = '0x' + newApiKeyIndex.toString(16).padStart(16, '0');
    
    const l1Message = `Register Lighter Account\n\npubkey: 0x${params.newPubkey}\nnonce: ${nonceHex}\naccount index: ${accountIndexHex}\napi key index: ${newApiKeyIndexHex}\nOnly sign this message for a trusted client!`;
    console.log("l1Message", l1Message);

    const client = new EVMWalletClient(
        hubBaseUrl,
        token.access_token,
        context.deploymentId
      );
    console.log("client", client);
    console.log("wallet", wallet);
  
    const l1Sig = await client.signMessage(l1Message, "evm:eip155:8453", wallet)
    console.log("l1Sig", l1Sig);

    let l1SigHex = l1Sig;
      if (typeof l1Sig === 'object' && l1Sig.r && l1Sig.s && l1Sig.v) {
        const { r, s, v } = l1Sig;
        const vHex = parseInt(v, 16).toString(16).padStart(2, '0');
        l1SigHex = `0x${r}${s}${vHex}`;
      }

    const expiredAt = Date.now() + (10 * 60 * 1000); 
    console.log("expiredAt", expiredAt);
    
    const result = await ((signerClient as any).wallet as any).signChangePubKey({
      pubkey: params.newPubkey,
      l1Sig: l1SigHex,
      newApiKeyIndex,
      nonce,
      expiredAt
    });

    if (result.error) {
      return [null, '', result.error];
    }

    const txHash = await (signerClient as any).transactionApi.sendTx(
      SignerClient.TX_TYPE_CHANGE_PUB_KEY,
      result.txInfo
    );

    return [txHash, txHash.tx_hash || txHash.hash || '', null];
  } catch (error) {
    return [null, '', error instanceof Error ? error.message : 'Unknown error'];
  }
}

async function setupLighterApiKey(
  hubBaseUrl: string,
  walletToSession: Record<string, string>
): Promise<{
  apiPrivateKey: string;
  apiKeyIndex: number;
  accountIndex: number;
  baseUrl: string;
  txHash: string;
}> {
  const { token, context } = getAuthContext("osiris");
  if (!token || !context) {
    throw new Error("No token or context found");
  }

  const wallet = walletToSession[context.sessionId];
  if (!wallet) {
    throw new Error("No wallet found, you need to choose a wallet first with chooseWallet");
  }

  const client = new EVMWalletClient(
    hubBaseUrl,
    token.access_token,
    context.deploymentId
  );

  const account = await client.getViemAccount(wallet, "evm:eip155:8453");
  if (!account) {
    throw new Error("No account found, you need to choose a wallet first with chooseWallet");
  }

  const ethAddress = account.address;
  logger.info("Using wallet address", { ethAddress });

  try {
    logger.info("Finding accounts for address", { ethAddress });
    
    const url = `https://mainnet.zklighter.elliot.ai/api/v1/account?by=l1_address&value=${encodeURIComponent(ethAddress)}`;
    
    logger.info("Making API request", {
      url,
      ethAddress
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
          throw new Error(`No accounts found for ${ethAddress}. Create an account at https://app.lighter.xyz first`);
        }
      } catch (e) {
        logger.error("Could not read error response body", { error: e });
      }
      
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}. Body: ${errorBody}`);
    }

    const data = await response.json();
    logger.info("API response data", { data });

    if (data.code !== 200 || !data.accounts || data.accounts.length === 0) {
      throw new Error(`No accounts found for ${ethAddress}. Create an account at https://app.lighter.xyz first`);
    }

    const accounts = data.accounts;
    logger.info(`Found ${accounts.length} account(s)`, { accounts: accounts.length });

    const masterAccount = accounts.find((acc: any) => acc.account_type === 0 || acc.account_type === '0');
    const accountIndex = parseInt(masterAccount?.index || accounts[0].index, 10);
    
    logger.info("Using account", { accountIndex });

    const accountUrl = `https://mainnet.zklighter.elliot.ai/api/v1/account?by=index&value=${accountIndex}`;
    const accountResponse = await fetch(accountUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!accountResponse.ok) {
      throw new Error(`Failed to get account details: ${accountResponse.status} - ${accountResponse.statusText}`);
    }

    const accountData = await accountResponse.json();
    const account = accountData.accounts?.[0] || accountData;
    
    if (ethAddress.toLowerCase() !== account.l1_address.toLowerCase()) {
      throw new Error(`Address mismatch! Your wallet address ${ethAddress} doesn't match the account's L1 address ${account.l1_address}`);
    }

    logger.info("Checking existing API keys");
    
    const existingKeys: number[] = [];
    try {
      const apiKeysUrl = `https://mainnet.zklighter.elliot.ai/api/v1/apikeys?account_index=${accountIndex}&api_key_index=255`;
      const apiKeysResponse = await fetch(apiKeysUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      
      if (apiKeysResponse.ok) {
        const apiKeysData = await apiKeysResponse.json();
        if (apiKeysData.code === 200 && apiKeysData.api_keys) {
          existingKeys.push(...apiKeysData.api_keys.map((key: any) => key.api_key_index));
          logger.info("Retrieved existing API keys", { existingKeys });
        }
      }
    } catch (error) {
      logger.warning("Failed to retrieve existing API keys, will use index 0", { error });
    }
    
    logger.info("Existing keys found", { existingKeys });

    let targetIndex = existingKeys.length > 0 ? Math.max(...existingKeys) + 1 : 0;
    
    logger.info("Will register new key at index", { targetIndex });

    logger.info("Generating new API key pair");
    
    const tempSigner = new SignerClient({
      url: 'https://mainnet.zklighter.elliot.ai',
      privateKey: '0'.repeat(80),
      accountIndex,
      apiKeyIndex: 0,
      wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
    });
    
    await tempSigner.initialize();
    await tempSigner.ensureWasmClient();
    
    const keyPair = await tempSigner.generateAPIKey();
    if (!keyPair) {
      throw new Error('Failed to generate key');
    }
    
    logger.info("Generated key pair", { 
      privateKeyLength: keyPair.privateKey.length,
      publicKeyLength: keyPair.publicKey.length 
    });
    
    await tempSigner.close();

    // Create SignerClient with NEW key
    logger.info("Creating SignerClient with new key");
    
    const newKeySigner = new SignerClient({
      url: 'https://mainnet.zklighter.elliot.ai',
      privateKey: keyPair.privateKey,
      accountIndex,
      apiKeyIndex: targetIndex,
      wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
    });
    
    await newKeySigner.initialize();
    await newKeySigner.ensureWasmClient();
    logger.info("SignerClient ready");

    // Register API key on-chain
    logger.info("Registering API key on-chain");
    
    const [_response, txHash, error] = await changeApiKey(newKeySigner, walletToSession, hubBaseUrl, {
      newPubkey: keyPair.publicKey,
      newApiKeyIndex: targetIndex
    });

    if (error) {
      throw new Error(`Registration failed: ${error}`);
    }

    logger.info("API key registered successfully", { txHash });
    
    await newKeySigner.close();

    return {
      apiPrivateKey: keyPair.privateKey,
      apiKeyIndex: targetIndex,
      accountIndex,
      baseUrl: hubBaseUrl,
      txHash: txHash
    };

  } catch (error) {
    throw error;
  }
}

export function registerSystemSetupTools(
  server: McpServer,
  lighterMCP: LighterMCP
): void {
  logger.info("🔧 Registering system setup tools...");

  server.tool(
    "setup_lighter_api_key",
    "Set up a new Lighter API key for the current wallet. This will generate a new API key pair and register it on-chain. Returns the API private key, key index, account index, and transaction hash.",
    {
      type: "object",
      properties: {},
      required: []
    },
    async (): Promise<CallToolResult> => {
      try {
        logger.toolCalled("setup_lighter_api_key");

        const result = await setupLighterApiKey(
          lighterMCP.hubBaseUrl,
          lighterMCP.walletToSession
        );

        const response = {
          apiPrivateKey: result.apiPrivateKey,
          apiKeyIndex: result.apiKeyIndex,
          accountIndex: result.accountIndex,
          baseUrl: result.baseUrl,
          txHash: result.txHash,
          message: "API key setup completed successfully. Save these values to your environment variables."
        };

        logger.toolCompleted("setup_lighter_api_key");
        return createSuccessResponse(
          `✅ Successfully set up Lighter API key at index ${result.apiKeyIndex}. Transaction hash: ${result.txHash}`,
          response
        );
      } catch (error) {
        return handleToolError("setup_lighter_api_key", error);
      }
    }
  );

  logger.info("✅ System setup tools registered successfully");
}

function handleToolError(toolName: string, error: unknown): CallToolResult {
  logger.error("System setup tool execution failed", {
    tool: toolName,
    error: error instanceof Error ? error.message : String(error),
  });

  return createErrorResponse(error);
}