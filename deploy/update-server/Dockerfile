# Kairos Update Server - Dockerfile
# Build: docker build -t kairos-update-server .
# Run:   docker run -p 4097:4097 -v ./downloads:/app/downloads kairos-update-server

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist

# Volume para downloads (montado em runtime)
RUN mkdir -p /app/downloads
VOLUME ["/app/downloads"]

EXPOSE 4097
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4097/health || exit 1

CMD ["node", "dist/index.js"]
