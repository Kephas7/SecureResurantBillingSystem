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

  // --- Security headers ---
  app.use(helmet());

  // --- CORS: only the known frontend origin, credentials allowed for cookies ---
  app.enableCors({
    origin: process.env.WEB_ORIGIN,
    credentials: true,
  });

  // --- Global input validation: reject unknown/extra fields (anti mass-assignment) ---
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
      name: "sid", // avoid default "connect.sid" fingerprint
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 30, // 30 min idle timeout; document this choice in report
      },
    }),
  );

  // --- Generic error responses: do not leak stack traces / internals ---
  // (A global exception filter implementing this lives in common/filters
  // once added in the auth/error-handling module pass.)

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap();
