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


