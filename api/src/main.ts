import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import session from "express-session";
import RedisStore from "connect-redis";
import Redis from "ioredis";
import { json, urlencoded, Request, Response, NextFunction } from "express";
import { join } from "path";
import { AppModule } from "./app.module";

// HTTP security headers are a defence-in-depth layer. They do not
// replace input validation or authentication but reduce the impact of
// vulnerabilities like XSS (CSP), clickjacking (frameguard), and
// protocol downgrade attacks (HSTS). Implemented per the OWASP Secure
// Headers Project recommendations.
async function bootstrap() {
  // bodyParser is disabled here so the size-limited json()/urlencoded()
  // middleware below are the ONLY body parsers registered - Nest's
  // default bodyParser (enabled unless turned off) would otherwise
  // consume the request stream first, silently making any body-parser
  // middleware added afterwards a no-op with no size limit actually
  // enforced.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  app.use(
    helmet({
      // Restricts which sources the browser will load scripts/styles/
      // images/etc from - the primary defence against XSS payload
      // execution even if an injection point exists somewhere in the
      // app (script-src 'self' blocks any injected <script src="evil">
      // or inline handler from ever running).
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      // Prevents clickjacking - stops the app being embedded in an
      // iframe on an attacker's page to trick users into clicking
      // hidden UI elements.
      frameguard: { action: "deny" },
      // Helmet's default (Cross-Origin-Resource-Policy: same-origin)
      // blocks the browser from loading ANY response cross-origin as a
      // subresource - including <img> tags. That default is correct for
      // this API's JSON endpoints (which are already independently
      // protected by the exact-match CORS policy below), but it also
      // blocks the web app (a different origin: :3000 vs this API's
      // :4000) from ever rendering images served from /uploads/, since
      // <img> loads are governed by CORP, not by CORS/credentials.
      // Set to "cross-origin" so publicly-servable, non-sensitive static
      // assets (uploaded menu item images) can be embedded from the
      // frontend's origin, while CORS continues to gate every JSON
      // endpoint's actual data. (MDN/OWASP - Cross-Origin-Resource-Policy)
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // Prevents MIME-type sniffing attacks - stops the browser from
      // re-interpreting a response as a different content type than
      // declared (e.g. treating an uploaded "image" as executable JS).
      noSniff: true,
      // Stops the browser sending the full Referer header (which can
      // leak URLs containing sensitive query params/tokens) to other
      // origins on cross-origin navigation.
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // Enforces HTTPS for 1 year in production, preventing protocol-
      // downgrade/SSL-stripping attacks. Left off in dev since local
      // HTTP has no TLS to enforce.
      hsts:
        process.env.NODE_ENV === "production"
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
      // Removes the X-Powered-By header - a small fingerprinting
      // reduction so an attacker doing recon can't trivially confirm
      // this is an Express app from the response headers alone.
      hidePoweredBy: true,
    }),
  );

  // --- CORS: exact-match origin check, credentials allowed for cookies ---
  // Uses an exact-match callback rather than a regex or wildcard. A
  // misconfigured regex (e.g. /restaurant\.local/) can be bypassed by an
  // attacker registering a domain like evil-restaurant.local, since the
  // pattern matches anywhere in the string unless carefully anchored.
  // Exact string match eliminates this class of CORS misconfiguration
  // entirely (PortSwigger Web Security Academy - CORS vulnerabilities).
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = process.env.WEB_ORIGIN;
      // Allow requests with no Origin header (server-to-server calls,
      // curl, same-origin requests) - only browser-driven cross-origin
      // requests carry an Origin header for CORS to police in the first
      // place.
      if (!origin || origin === allowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
    // Do not expose any internal headers to the browser beyond the
    // handful CORS always allows by default.
    exposedHeaders: [],
  });

  // --- Request body size limits ---
  // Without an explicit limit, an attacker can send arbitrarily large
  // request bodies to exhaust server memory or CPU parsing them. 100kb
  // is generous for every legitimate payload in this system (the
  // largest is an order with several line items) (OWASP A05: Security
  // Misconfiguration).
  app.use(json({ limit: "100kb" }));
  app.use(urlencoded({ extended: true, limit: "100kb" }));

  // --- Global input validation ---
  // whitelist: strips any property not declared on the DTO.
  // forbidNonWhitelisted: rejects the request outright if it *did* send an
  // undeclared property, instead of silently dropping it.
  // Together these block mass-assignment attacks (e.g. a client sneaking
  // `roleId: "<admin-role-id>"` into a register/update payload) because
  // any field the DTO doesn't explicitly declare can never reach the
  // service layer.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // --- Session store in Redis, secure cookie attributes ---
  // ACCEPTED RISK — FINDING-006 (Informational, Day 8 pentest)
  // No cap on concurrent sessions per user: logging in again does not
  // evict any prior session, so a stolen/leaked session cookie stays
  // valid until it expires or is explicitly logged out, even after the
  // legitimate user logs in elsewhere. Enforcing a limit (e.g. evict
  // oldest beyond N) requires tracking session IDs per user, which
  // requires the Redis client below to be injectable into AuthService
  // - today it is constructed here, ad hoc, purely for express-session,
  // and is not part of the Nest DI graph at all. Wiring that up
  // correctly (a proper Redis provider/module, ideally a sorted set
  // keyed by login timestamp so eviction is actually oldest-first
  // rather than the unordered "first member of a Redis Set" a quick
  // version would produce) is a real infrastructure change, not a
  // one-line fix, and this finding is not independently exploitable.
  // Accepted for now; see docs/pentest/findings.md FINDING-006 for the
  // full justification and the recommended follow-up design.
  // (OWASP Session Management Cheat Sheet — Concurrent Sessions)
  const redisClient = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
  });

  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: "sess:" }),
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: false,
      // Avoid the default "connect.sid" cookie name, which fingerprints
      // the app as running Express/express-session to any attacker
      // inspecting cookies (OWASP A05 Security Misconfiguration).
      name: "sid",
      cookie: {
        // Not readable via document.cookie / JS - blocks session-cookie
        // theft via XSS (OWASP A03 Injection / XSS impact reduction).
        httpOnly: true,
        // Only sent over HTTPS in production - blocks session cookie
        // interception over plaintext HTTP (network eavesdropping / MITM).
        secure: process.env.NODE_ENV === "production",
        // "lax" is sent on top-level navigation but not on cross-site
        // subrequests/form posts from other origins - mitigates CSRF
        // while still allowing normal same-site navigation to work.
        sameSite: "lax",
        // 30 min idle timeout: limits the window an abandoned/stolen
        // session cookie remains valid (OWASP ASVS session management).
        maxAge: 1000 * 60 * 30,
      },
    }),
  );

  // --- Generic error responses: do not leak stack traces / internals ---
  // Registered globally as APP_FILTER in AppModule (GlobalExceptionFilter)
  // so it applies to every route without per-controller wiring.

  // SECURITY FIX — FINDING-005
  // Express middleware errors (body size limit, CORS) bypass the
  // NestJS GlobalExceptionFilter because they occur before the
  // NestJS request pipeline - they are thrown by the json()/cors()
  // middleware registered above, as plain Error objects, not
  // NestJS HttpExceptions, so GlobalExceptionFilter's
  // `instanceof HttpException` check never matches them and they
  // fell through to a raw Express 500. This Express-level error
  // handler catches them and returns clean JSON responses
  // consistent with the rest of the API's error format. Without
  // this, oversized payloads and CORS rejections returned a
  // generic 500 instead of 413/403, undermining monitoring/alerting
  // clarity for what are actually working-as-intended security
  // rejections, not application faults.
  // Must be registered last (Express error-handling middleware -
  // identified by its 4-argument signature - only catches errors
  // from middleware/routes registered before it in the stack).
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(
    (err: { status?: number; type?: string; message?: string }, _req: Request, res: Response, _next: NextFunction) => {
      const isPayloadTooLarge = err.type === "entity.too.large";
      const isCorsRejection = err.message?.startsWith("CORS:") ?? false;

      const status = isPayloadTooLarge ? 413 : isCorsRejection ? 403 : (err.status ?? 500);
      const message = isPayloadTooLarge
        ? "Request payload too large (max 100kb)"
        : isCorsRejection
          ? "Origin not allowed"
          : (err.message ?? "An error occurred");

      res.status(status).json({
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
      });
    },
  );

  /**
   * SECURITY: Static file serving for uploaded images.
   *
   * Only the /uploads path is exposed as static assets. Files are
   * served as raw bytes with no server-side execution, so even if an
   * attacker somehow got a script-bearing file past every upload
   * validation layer (see upload.service.ts), the static file handler
   * has no mechanism to execute it — it can only ever be returned as
   * a byte stream with a content type Express infers from the extension.
   *
   * Files are stored with UUID names (see UploadService), so:
   *   - No enumeration is possible (names are not sequential)
   *   - No path traversal is possible (NestExpressApplication's
   *     staticAssets resolves paths relative to the destination and
   *     Express's static middleware itself rejects "..' segments)
   *   - Original filenames are never used in URLs
   *
   * In production, this should be replaced with a CDN or a dedicated
   * static file server (e.g. nginx) serving the uploads directory
   * directly, with the API only handling upload/delete operations.
   */
  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/uploads/",
  });

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap();
