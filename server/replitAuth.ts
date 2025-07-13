import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import MemoryStore from "memorystore";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  // Use memory store for development, PostgreSQL for production
  let store = undefined;
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    const pgStore = connectPg(session);
    store = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ttl: sessionTtl,
      tableName: "sessions",
      schemaName: "public"
    });
  } else {
    // Use memory store for development to avoid session regeneration issues
    const memoryStore = MemoryStore(session);
    store = new memoryStore({
      checkPeriod: sessionTtl
    });
  }
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: store,
    resave: false,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: 'lax'
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  
  // Setup session middleware
  const sessionMiddleware = getSession();
  app.use(sessionMiddleware);
  
  // Initialize passport
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const claims = tokens.claims();
    const user = {
      id: claims["sub"]
    };
    updateUserSession(user, tokens);
    await upsertUser(claims);
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", async (req, res) => {
    try {
      // Use a Promise-based approach to handle logout
      const logoutPromise = new Promise<void>((resolve, reject) => {
        req.logout((err) => {
          if (err) {
            console.error("Logout error:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // Wait for logout to complete
      await logoutPromise;
      
      // Clear session data only if session exists
      if (req.session) {
        const sessionDestroyPromise = new Promise<void>((resolve, reject) => {
          req.session.destroy((sessionErr) => {
            if (sessionErr) {
              console.error("Session destroy error:", sessionErr);
              reject(sessionErr);
            } else {
              resolve();
            }
          });
        });
        
        await sessionDestroyPromise;
      }
      
      // Clear all possible session cookies with comprehensive options
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: 'lax'
      });
      
      // Clear any additional authentication cookies
      res.clearCookie('session', { path: '/' });
      res.clearCookie('auth', { path: '/' });
      
      // Build logout URL that forces complete OAuth provider logout
      const config = await getOidcConfig();
      const logoutUrl = client.buildEndSessionUrl(config, {
        client_id: process.env.REPL_ID!,
        post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
      });
      
      // Add additional parameters to force complete logout
      logoutUrl.searchParams.set('logout_hint', 'force');
      logoutUrl.searchParams.set('prompt', 'login');
      
      res.redirect(logoutUrl.href);
    } catch (error) {
      console.error("Complete logout error:", error);
      // Clear cookies even if session handling fails
      res.clearCookie('connect.sid', { path: '/' });
      res.clearCookie('session', { path: '/' });
      res.clearCookie('auth', { path: '/' });
      // Fallback: redirect to home page
      res.redirect('/');
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
