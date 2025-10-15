import type { DestinationStream, Logger as PinoLoggerImpl } from "pino";
import pino from "pino";
import { LOG_LEVELS, Logger } from "./types.js";

export class McpLogger implements Logger {
  readonly #logger: PinoLoggerImpl;
  private serviceName: string;

  constructor(
    serviceName: string,
    private level: LOG_LEVELS = LOG_LEVELS.INFO,
    private prettyPrintEnabled: boolean = process.env.NODE_ENV !== "production",
    destStream?: DestinationStream
  ) {
    this.serviceName = serviceName;

    const pinoConfig = {
      name: serviceName,
      level: this.level,
      transport: this.prettyPrintEnabled
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              sync: true,
              translateTime: "yyyy-mm-dd HH:MM:ss.l",
              ignore: "pid,hostname",
            },
          }
        : undefined,
    };

    this.#logger = destStream ? pino(pinoConfig, destStream) : pino(pinoConfig);
  }

  debug(message: string, metadata?: object): void {
    if (metadata) {
      this.#logger.debug(metadata, message);
    } else {
      this.#logger.debug(message);
    }
  }

  info(message: string, metadata?: object): void {
    if (metadata) {
      this.#logger.info(metadata, message);
    } else {
      this.#logger.info(message);
    }
  }

  warning(message: string, metadata?: object): void {
    if (metadata) {
      this.#logger.warn(metadata, message);
    } else {
      this.#logger.warn(message);
    }
  }

  error(message: string, metadata?: object): void {
    if (metadata) {
      this.#logger.error(metadata, message);
    } else {
      this.#logger.error(message);
    }
  }

  toolCalled(toolName: string, args?: any): void {
    this.info("Tool called", { tool: toolName, arguments: args });
  }

  toolCompleted(toolName: string, duration?: number): void {
    this.info("Tool completed", {
      tool: toolName,
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  authContextMissing(): void {
    this.warning("No authentication context available");
  }

  serverStarted(port?: number, userId?: string, deploymentId?: string): void {
    this.info("MCP server started", {
      service: this.serviceName,
      port,
      userId,
      deploymentId,
    });
  }

  serverConfigured(): void {
    this.info("MCP server configured successfully", {
      service: this.serviceName,
    });
  }
}