import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { logger } from "../lib/logger";
import { AppError } from "../utils/app-error";

export function notFoundHandler(_request: Request, _response: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", "Route not found."));
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  logger.error({ error }, "Unhandled application error");

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred."
    }
  });
}

