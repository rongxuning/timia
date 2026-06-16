FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com \
  && npm config set fetch-timeout 600000 \
  && npm ci --no-fund --no-audit --loglevel=info

COPY . .

# Build args must sit immediately before `npm run build` so URL/revision changes bust cache.
ARG NEXT_PUBLIC_API_BASE_URL
ARG BUILD_REVISION=local
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN echo "web build revision=${BUILD_REVISION} api=${NEXT_PUBLIC_API_BASE_URL}" \
  && npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
