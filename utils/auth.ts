import { EVMWalletClient } from "@osiris-ai/web3-evm-sdk";
import { getAuthContext } from '@osiris-ai/sdk';

export async function createAuthTokenWithExpiry(
  hubBaseUrl: string,
  walletToSession: Record<string, string>,
  expiry: number,
  accountIndex: number
): Promise<[string, string | null]> {
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
    return ['', error.message];
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const config = {
      accountIndex: accountIndex,
      apiKeyIndex: 0
    };
    const message = `${config.accountIndex}:${config.apiKeyIndex}:${timestamp + expiry}`;

    const client = new EVMWalletClient(
      hubBaseUrl,
      token.access_token,
      context.deploymentId
    );

      const signature = await client.signMessage(message, "evm:eip155:8453", wallet);
      
      let signatureHex = signature;
      if (typeof signature === 'object' && signature.r && signature.s && signature.v) {
        const { r, s, v } = signature;
        const vHex = parseInt(v, 16).toString(16).padStart(2, '0');
        signatureHex = `0x${r}${s}${vHex}`;
      }
      
      return [signatureHex, null];

  } catch (error) {
    return ['', error instanceof Error ? error.message : 'Unknown error'];
  }
}
