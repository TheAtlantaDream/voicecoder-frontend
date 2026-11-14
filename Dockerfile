FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lockb* bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM nginx:alpine AS production

# Inlined into /config.js when the container starts. Override at build or run time.
ARG DEFAULT_BRIDGE_URL=/ws
ARG TARGET_SAMPLE_RATE=16000
ARG VSCODE_WEB_URL=/vscode/
ENV DEFAULT_BRIDGE_URL=$DEFAULT_BRIDGE_URL
ENV TARGET_SAMPLE_RATE=$TARGET_SAMPLE_RATE
ENV VSCODE_WEB_URL=$VSCODE_WEB_URL

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
ENTRYPOINT ["sh", "/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

