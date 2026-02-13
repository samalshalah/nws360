import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User, SYSTEM_ROLES } from "@shared/schema";
import { fetchAllFeeds } from "./feed-worker";

declare module "express-session" {
  interface SessionData {
    impersonation?: {
      activeOrganizationId: number | null;
      activeUserId: number | null;
      originalUserId: number;
      isImpersonating: boolean;
    };
    selectedTenantId?: number;
  }
}

const scryptAsync = promisify(scrypt);
const MemoryStore = createMemoryStore(session);

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "r3pl1t_s3cr3t_k3y",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000,
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      secure: true,
    };
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        } else {
          const [salt, key] = user.password.split(":");
          const hashedBuffer = (await scryptAsync(password, salt, 64)) as Buffer;

          const keyBuffer = Buffer.from(key, "hex");
          const match = timingSafeEqual(hashedBuffer, keyBuffer);

          if (!match) {
            return done(null, false, { message: "Incorrect password." });
          } else {
            return done(null, user);
          }
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, (user as User).id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(req.body.password, salt, 64)) as Buffer;
      const hashedPassword = `${salt}:${buf.toString("hex")}`;

      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      try {
        const defaultGroupName = user.role === SYSTEM_ROLES.SYSTEM_ADMIN ? "Platform Admin" :
          user.role === SYSTEM_ROLES.CLIENT_ADMIN ? "Organization Admin" :
          user.role === SYSTEM_ROLES.CLIENT_USER ? "Analyst" : "Viewer";
        const group = await storage.getPermissionGroupByName(defaultGroupName);
        if (group) {
          await storage.assignUserToGroup(user.id, group.id);
        }
      } catch (e) {
        console.error("[Register] Auto-assign permission group failed:", e);
      }

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).send(info.message || "Login failed");
      }
      req.login(user, (err) => {
        if (err) return next(err);
        res.json(user);
        storage.trackUsage("login", user.id).catch(() => {});
        setTimeout(() => {
          fetchAllFeeds().catch((e) =>
            console.error("[Login] Background fetch-all failed:", e)
          );
        }, 500);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}

export function requirePermission(...permissionCodes: string[]) {
  return async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;

    if (user.role === SYSTEM_ROLES.SYSTEM_ADMIN) return next();

    try {
      const userPerms = await storage.getEffectivePermissions(user.id);
      const hasAll = permissionCodes.every((code) => userPerms.includes(code));
      if (!hasAll) {
        return res.status(403).json({ message: "Insufficient permissions", required: permissionCodes });
      }
      next();
    } catch (err: any) {
      console.error("[requirePermission] Error:", err.message);
      res.status(500).json({ message: "Permission check failed" });
    }
  };
}

export function requireAnyPermission(...permissionCodes: string[]) {
  return async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;

    if (user.role === SYSTEM_ROLES.SYSTEM_ADMIN) return next();

    try {
      const userPerms = await storage.getEffectivePermissions(user.id);
      const hasAny = permissionCodes.some((code) => userPerms.includes(code));
      if (!hasAny) {
        return res.status(403).json({ message: "Insufficient permissions", required: permissionCodes });
      }
      next();
    } catch (err: any) {
      console.error("[requireAnyPermission] Error:", err.message);
      res.status(500).json({ message: "Permission check failed" });
    }
  };
}
