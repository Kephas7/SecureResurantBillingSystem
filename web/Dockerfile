# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars must be present as build-time ENV (not just passed
# to `docker build --build-arg`) because Next.js inlines them into the
# client bundle during `next build` - they can't be supplied later at
# container startup like a normal server-side env var.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CAPTCHA_SITE_KEY=$NEXT_PUBLIC_CAPTCHA_SITE_KEY

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./next.config.js

USER appuser

EXPOSE 3000
CMD ["npm", "start"]
