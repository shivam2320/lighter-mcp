import { z } from 'zod';

export const HelloToolSchema = {
  name: z.string().default('World').describe('Name to greet'),
};

export const HelloPromptSchema = {
  topic: z.string(),
};


