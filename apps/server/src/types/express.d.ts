export {};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        role: import("@prisma/client").UserRole;
      };
    }
  }
}
