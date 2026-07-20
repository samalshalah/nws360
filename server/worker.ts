import { httpServerHandler } from "cloudflare:node";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { log } from "./index-log";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

await registerRoutes(httpServer, app);

const { storage } = await import("./storage");
storage.seedDefaultPermissions().catch((err: any) =>
  console.error("[Seed] Permission seeding failed:", err.message),
);

app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error("Internal Server Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({ message });
});

httpServer.listen(3000);

const apiHandler = httpServerHandler({ port: 3000 });

export default {
  async fetch(request: Request, workerEnv: any, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      return apiHandler.fetch(request, workerEnv, ctx);
    }

    return workerEnv.ASSETS.fetch(request);
  },
};
