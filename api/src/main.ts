import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import session from "express-session";
import RedisStore from "connect-redis";
import Redis from "ioredis";
import { json, urlencoded } from "express";
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
  const app = await NestFactory.create(AppModule, { bodyParser: false });

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

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap();
