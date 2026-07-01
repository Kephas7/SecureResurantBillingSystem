import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import session from "express-session";
import RedisStore from "connect-redis";
import Redis from "ioredis";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // --- Security headers (OWASP Secure Headers Project) ---
  // Sets sane defaults for CSP, X-Frame-Options, X-Content-Type-Options,
  // HSTS, etc. so we don't have to hand-roll each header individually.
  app.use(helmet());

  // --- CORS: only the known frontend origin, credentials allowed for cookies ---
  app.enableCors({
    origin: process.env.WEB_ORIGIN,
    credentials: true,
  });

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
