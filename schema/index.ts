import { z } from 'zod';

export const HelloToolSchema = {
  name: z.string().default('World').describe('Name to greet'),
};

export const HelloPromptSchema = {
  topic: z.string(),
};

export const FetchPriceToolSchema = {
  ticker: z.string().describe("The ticker symbol to fetch price for (e.g., ETH, BTC, SOL, DOGE)"),
  limit: z.number().min(1).max(100).default(10).describe("Number of orders to fetch (1-100, default: 10)"),
};

export const FetchReferralPointsToolSchema = {
  private_key: z.string().describe("The private key for authentication with Lighter protocol"),
  api_key_index: z.number().min(0).default(0).describe("The API key index for the transaction (defaults to 0)"),
};

export const CreateMarketOrderToolSchema = {
  ticker: z.string().describe("The ticker symbol for the market (e.g., ETH, BTC, SOL, DOGE)"),
  usd_amount: z.number().positive().describe("The USD amount (position margin) for the order"),
  is_ask: z.boolean().describe("Whether this is an ask (sell) order (true) or bid (buy) order (false)"),
  leverage: z.number().min(1).max(100).default(10).describe("Leverage for the order (1-100, default: 10)"),
  private_key: z.string().min(1).describe("Private key for signing the transaction"),
  api_key_index: z.number().min(0).default(0).describe("API key index for the transaction (defaults to 0)"),
};

export const CreateLimitOrderToolSchema = {
  ticker: z.string().describe("The ticker symbol for the market (e.g., ETH, BTC, SOL, DOGE)"),
  base_amount: z.number().positive().describe("The base amount for the order"),
  price: z.number().positive().describe("The limit price for the order (in cents)"),
  is_ask: z.boolean().describe("Whether this is an ask (sell) order (true) or bid (buy) order (false)"),
  leverage: z.number().min(1).max(100).default(10).describe("Leverage for the order (1-100, default: 10)"),
  private_key: z.string().min(1).describe("Private key for signing the transaction"),
  api_key_index: z.number().min(0).default(0).describe("API key index for the transaction (defaults to 0)"),
};

export const ClosePositionToolSchema = {
  ticker: z.string().describe("The ticker symbol for the market to close position (e.g., ETH, BTC, SOL, DOGE)"),
  position_index: z.number().min(-1).default(-1).describe("Position index to close (-1 for auto-select first position, 0+ for specific position)"),
  private_key: z.string().min(1).describe("Private key for signing the transaction"),
  api_key_index: z.number().min(0).default(0).describe("API key index for the transaction (defaults to 0)"),
};

export const CancelOrderToolSchema = {
  ticker: z.string().describe("The ticker symbol for the market (e.g., ETH, BTC, SOL, DOGE)"),
  order_index: z.number().min(0).describe("The order index to cancel"),
  private_key: z.string().min(1).describe("Private key for signing the transaction"),
  api_key_index: z.number().min(0).default(0).describe("API key index for the transaction (defaults to 0)"),
};

export const AddTpSlOrdersToolSchema = {
  ticker: z.string().describe("The ticker symbol for the market (e.g., ETH, BTC, SOL, DOGE)"),
  position_index: z.number().min(-1).default(-1).describe("Position index to add TP/SL orders to (-1 for auto-select first position, 0+ for specific position)"),
  take_profit_price: z.number().positive().optional().describe("Take profit price (in cents) - optional"),
  stop_loss_price: z.number().positive().optional().describe("Stop loss price (in cents) - optional"),
  private_key: z.string().min(1).describe("Private key for signing the transaction"),
  api_key_index: z.number().min(0).default(0).describe("API key index for the transaction (defaults to 0)"),
};


