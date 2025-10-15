import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
// import { Address } from "viem";

export enum LOG_LEVELS {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export interface Logger {
  debug(message: string, metadata?: object): void;
  info(message: string, metadata?: object): void;
  warning(message: string, metadata?: object): void;
  error(message: string, metadata?: object): void;
}

export interface McpConfig {
  name: string;
  version: string;
  hubBaseUrl?: string;
  userId?: string;
  service?: string;
  deploymentId?: string;
}

/**
 * Create a successful MCP tool response
 */
export const createSuccessResponse = (
  message: string,
  data?: any
): CallToolResult => ({
  content: [
    {
      type: "text",
      text: data
        ? `${message}\n\nData: ${JSON.stringify(
            data,
            (_, v) => (typeof v === "bigint" ? v.toString() : v),
            2
          )}`
        : message,
    },
  ],
});

/**
 * Create an error MCP tool response
 */
export const createErrorResponse = (
  error: string | Error | any,
  data?: any
): CallToolResult => ({
  content: [
    {
      type: "text",
      text: data
        ? `Error: ${
            error instanceof Error ? error.message : String(error)
          }\n\nDetails: ${JSON.stringify(data, null, 2)}`
        : `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
});

/**
 * Create an authentication error response with optional custom message and auth details
 */
export const createAuthErrorResponse = (
  customMessage?: string,
  authDetails?: {
    authorizationUrl?: string;
    availableServices?: string[];
    missingService?: string;
    deploymentId?: string;
  }
): CallToolResult => {
  const defaultMessage =
    "Authentication required. Please ensure the MCP server is properly configured with authentication.";

  let message = customMessage || defaultMessage;

  if (authDetails) {
    message += "\n\nAuthentication Details:";

    if (authDetails.authorizationUrl) {
      message += `\n• Authorization URL: ${authDetails.authorizationUrl}`;
    }

    if (authDetails.missingService) {
      message += `\n• Missing Service: ${authDetails.missingService}`;
    }

    if (
      authDetails.availableServices &&
      authDetails.availableServices.length > 0
    ) {
      message += `\n• Available Services: ${authDetails.availableServices.join(
        ", "
      )}`;
    }

    if (authDetails.deploymentId) {
      message += `\n• Deployment ID: ${authDetails.deploymentId}`;
    }

    message +=
      "\n\n💡 Tip: Visit the authorization URL above to authenticate with the required service.";
  }

  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
};

/**
 * Create a validation error response
 */
export const createValidationErrorResponse = (
  field: string,
  message: string
): CallToolResult => ({
  content: [
    {
      type: "text",
      text: `Validation Error: ${field} - ${message}`,
    },
  ],
});

/**
 * Create a rate limit error response
 */
export const createRateLimitErrorResponse = (
  retryAfter?: string
): CallToolResult => ({
  content: [
    {
      type: "text",
      text: `Rate limit exceeded. ${
        retryAfter
          ? `Please wait ${retryAfter} seconds before retrying.`
          : "Please try again later."
      }`,
    },
  ],
});

/**
 * Create a service unavailable error response
 */
export const createServiceUnavailableResponse = (
  serviceName: string,
  estimatedTime?: string
): CallToolResult => ({
  content: [
    {
      type: "text",
      text: `${serviceName} service is temporarily unavailable. ${
        estimatedTime
          ? `Estimated recovery time: ${estimatedTime}.`
          : "Please try again in a few minutes."
      }`,
    },
  ],
});

/**
 * Create a permission denied error response
 */
export const createPermissionDeniedResponse = (
  action: string,
  requiredScopes?: string[]
): CallToolResult => {
  let message = `Permission denied: Unable to ${action}.`;

  if (requiredScopes && requiredScopes.length > 0) {
    message += `\n\nRequired permissions: ${requiredScopes.join(", ")}`;
    message +=
      "\n\n💡 Tip: You may need to re-authenticate with additional permissions.";
  }

  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
};

/**
 * Asset prices response data type
 */
export interface GetAssetPricesResponse {
  prices: Record<string, number>;
}

/**
 * Historical prices response data type
 */
export interface GetHistoricalPricesResponse {
  total: number;
  currency: string;
  timeFrame: string;
  timestamp_start: number;
  timestamp_end: number;
  results: string;
}

/**
 * Price feed data from Ostium API
 */
export interface PriceFeedData {
  feed_id: string;
  bid: number;
  mid: number;
  ask: number;
  isMarketOpen: boolean;
  isDayTradingClosed: boolean;
  secondsToToggleIsDayTradingClosed: number;
  from: string;
  to: string;
  timestampSeconds: number;
}

/**
 * Response from Ostium prices API
 */
export interface OstiumPricesResponse extends Array<PriceFeedData> {}

// export interface TokenInfo {
//   address: Address;
//   name: string;
//   symbol: string;
//   decimals: number;
//   totalSupply?: bigint;
// }

export interface Group {
  id: string;
  name: string;
  minLeverage: string;
  maxLeverage: string;
  maxCollateralP: string;
  longCollateral: string;
  shortCollateral: string;
}

export interface Fee {
  minLevPos: string;
}

export interface Pair {
  id: string;
  from: string;
  to: string;
  feed: string;
  overnightMaxLeverage: string;
  longOI: string;
  shortOI: string;
  maxOI: string;
  makerFeeP: string;
  takerFeeP: string;
  totalOpenTrades: string;
  totalOpenLimitOrders: string;
  lastFundingRate: string;
  lastTradePrice: string;
  minLeverage: string;
  maxLeverage: string;
  maxCollateralP: string;
  fee: Fee;
}

export interface Trade {
  id?: string;
  tradeID: string;
  trader: string;
  pair: {
      id: string;
      from: string;
      to: string;
      feed: string;
      accRollover: string;
      lastRolloverBlock: string;
      rolloverFeePerBlock: string;
      accFundingLong: string;
      spreadP: string;
      accFundingShort: string;
  };
  index: string;
  tradeType?: string;
  openPrice: string;
  closePrice?: string;
  takeProfitPrice: string;
  stopLossPrice: string;
  collateral: string;
  notional: string;
  tradeNotional: string;
  highestLeverage: string;
  leverage: string;
  isBuy: boolean;
  isOpen: boolean;
  closeInitiated?: boolean;
  funding: string;
  rollover: string;
  timestamp: string;
}

export interface LimitOrder {
  id: string;
  trader: string;
  pair: {
      id: string;
      feed: string;
      from: string;
      to: string;
  };
  collateral: string;
  leverage: string;
  isBuy: boolean;
  isActive: boolean;
  openPrice: string;
  takeProfitPrice: string;
  stopLossPrice: string;
  initiatedAt: string;
  limitType: string;
  block?: string;
  executionStarted?: boolean;
  notional?: string;
  tradeNotional?: string;
  orderId?: string;
  uniqueId?: string;
  updatedAt?: string;
}

export interface Order {
  id: string;
  trader: string;
  pair: {
      id: string;
      from: string;
      to: string;
      feed: string;
  };
  tradeID?: string;
  limitID?: string;
  orderType: string;
  orderAction: string;
  price: string;
  priceAfterImpact?: string;
  priceImpactP?: string;
  collateral: string;
  notional: string;
  tradeNotional: string;
  profitPercent?: string;
  totalProfitPercent?: string;
  amountSentToTrader?: string;
  isBuy: boolean;
  initiatedAt: string;
  executedAt?: string;
  initiatedTx?: string;
  executedTx?: string;
  initiatedBlock?: string;
  executedBlock?: string;
  leverage: string;
  isPending: boolean;
  isCancelled: boolean;
  cancelReason?: string;
  devFee?: string;
  vaultFee?: string;
  oracleFee?: string;
  liquidationFee?: string;
  fundingFee?: string;
  rolloverFee?: string;
  closePercent?: string;
}

export interface MetaData {
  liqMarginThresholdP: string;
}

export interface MappedOrder {
  id: string;
  trader: string;
  vaultFee: number;
  tradeNotional: number;
  tradeID: string;
  totalProfitPercent: number;
  rolloverFee: number;
  profitPercent: number;
  priceImpactP: number;
  priceAfterImpact: number;
  price: number;
  orderType: string;
  orderAction: string;
  oracleFee: number;
  notional: number;
  liquidationFee: number;
  limitID: string | null;
  leverage: number;
  isBuy: boolean;
  initiatedTx: string;
  initiatedBlock: number;
  initiatedAt: bigint;
  fundingFee: number;
  executedTx: string;
  executedBlock: number;
  executedAt: bigint;
  devFee: number;
  collateral: number;
  closePercent: number;
  cancelReason: string | null;
  amountSentToTrader: number;
  pairId: string;
}

export interface MappedLimit {
  id: string;
  block: number;
  collateral: number;
  executionStarted: boolean;
  initiatedAt: bigint;
  isActive: boolean;
  isBuy: boolean;
  leverage: number;
  limitType: string;
  notional: number;
  openPrice: number;
  orderId: string;
  pairId: string;
  trader: string;
  tradeNotional: number;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  uniqueId: string;
  updatedAt: Date;
}

export interface MappedPosition {
  id: string;
  isOpen: boolean;
  leverage: number;
  notional: number;
  openPrice: number;
  isBuy: boolean;
  index: number;
  highestLeverage: number;
  funding: number;
  collateral: number;
  pairId: string;
  rollover: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  timestamp: Date | null;
  tradeID: string;
  tradeNotional: number;
  tradeType: string;
  trader: string;
}

export interface MappedPair {
  id: number;
  from: string;
  to: string;
  // Group data flattened to top level
  longOI: number;
  shortOI: number;
  maxOI: number;
  makerFeeP: number;
  takerFeeP: number;
  minLeverage: number;
  maxLeverage: number;
  maxCollateralP: number;
  minLevPos: number;
  lastFundingRate: number;
  lastFundingBlock: number;
  overnightMaxLeverage?: number;
}

export interface FormattedPair {
  id: number;
  from: string;
  to: string;
  group: string;
  longOI: number;
  shortOI: number;
  maxOI: number;
  makerFeeP: number;
  takerFeeP: number;
  minLeverage: number;
  maxLeverage: number;
  makerMaxLeverage: number;
  groupMaxCollateralP: number;
  minLevPos: number;
  lastFundingRate: number;
  curFundingLong: number;
  curFundingShort: number;
  lastFundingBlock: number;
  overnightMaxLeverage?: number;
  price?: number;
  isMarketOpen?: boolean;
  isDayTradingClosed?: boolean;
}

export interface FormattedTrade {
  tradeID: string;
  index: number;
  pair: {
      from: string;
      to: string;
  };
  isOpen: boolean;
  collateral: number;
  leverage: number;
  highestLeverage: number;
  direction: 'Long' | 'Short';
  openPrice: number;
  closePrice?: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  notional: number;
  funding: number;
  tradeType?: string;
}

export interface FormattedOrder {
  status: string;
  isCancelled: boolean;
  cancelReason?: string;
  collateral: number;
  leverage: number;
  direction: 'Long' | 'Short';
  orderType: string;
  orderAction: string;
  price: number;
  tradeID?: string;
}

export interface PnLCalculationParams {
  isLong: boolean;
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
}

export interface PnLCalculationResult {
  pnl: number;
  percentChange: number;
  isProfitable: boolean;
  pnlPercentage: number;
}

// Market Order Types
export interface CreateMarketOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: string;
  avgExecutionPrice: string;
  isAsk: boolean;
}

export interface MarketOrderTransaction {
  AccountIndex: number;
  OrderBookIndex: number;
  ClientOrderIndex: number;
  BaseAmount: string;
  Price: string;
  IsAsk: number;
  OrderType: number;
  TimeInForce: number;
  ReduceOnly: number;
  TriggerPrice: number;
  Nonce: number;
  OrderExpiry: number;
}

export interface SignedMarketOrderTransaction extends MarketOrderTransaction {
  Sig: string;
}

export interface NonceResponse {
  nonce: number;
}

export interface TransactionApi {
  getNextNonce(accountIndex: number, apiKeyIndex: number): Promise<NonceResponse>;
  sendTx(txType: number, txData: string): Promise<string>;
}

export interface SignerClient {
  ORDER_TYPE_MARKET: number;
  ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL: number;
  TX_TYPE_CREATE_ORDER: number;
}