# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# node:20-alpine ships no OpenSSL at all, not even a version Prisma can
# probe. Without it, Prisma's runtime engine-detection can't identify
# "this host has OpenSSL 3.x" and silently defaults to guessing 1.1.x,
# loading a query engine binary built against a library that isn't
# present - a working `binaryTargets` entry in schema.prisma alone isn't
# enough; the runtime probe needs something to actually detect.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Production stage ---
FROM node:20-alpine AS production
WORKDIR /app

# Same reason as the builder stage - this is where the engine actually
# runs at request time, so it needs OpenSSL present too, not just during
# `prisma generate`.
RUN apk add --no-cache openssl

# Run as non-root user (security: principle of least privilege)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Uploaded images are written here at runtime (see UploadService).
# Created and chown'd to appuser explicitly - a bare `mkdir` here would
# leave the directory root-owned (this RUN still executes as root,
# before the USER switch below), which the non-root runtime user then
# could not write into, failing every upload with EACCES.
RUN mkdir -p uploads && chown -R appuser:appgroup uploads

USER appuser

EXPOSE 4000
CMD ["node", "dist/main"]
