# Stage 1: build the React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Vite bakes VITE_-prefixed env vars into the built bundle at build time
# (import.meta.env), not read from process.env at container startup the way
# every other secret in this project is (see README > Secrets management) -
# a build ARG is the only way this optional value reaches vite build at
# all, since this stage never has Doppler/DOPPLER_TOKEN available to it.
# Unset (the default), the frontend build just doesn't include a DSN and
# frontend monitoring stays off - same degrades-gracefully shape as
# everything else Sentry-related here.
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

# Stage 2: runtime
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Doppler CLI: fetches ANTHROPIC_API_KEY/DATABASE_URL/JWT_SECRET at container
# start and injects them into the process env (see CMD below) - the only
# secret this container is configured with directly is DOPPLER_TOKEN.
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' \
      -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' >> /etc/apk/repositories && \
    apk add --no-cache doppler

# Explicit allowlist, not `COPY . .` - only what the running app actually
# needs. Denylisting via .dockerignore means anything new added to the repo
# root (docs, e2e/, CI config) ships in the image by default unless someone
# remembers to exclude it; an allowlist fails the other, safer direction.
COPY --chown=node:node server.js ./
COPY --chown=node:node openapi.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node migrations/ ./migrations/
COPY --chown=node:node --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
EXPOSE 3000

# The official node:alpine image ships a non-root `node` user (uid 1000) for
# exactly this purpose - the process that actually handles requests doesn't
# need root once its dependencies are installed.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# doppler run fetches secrets using DOPPLER_TOKEN and injects them into the
# environment before exec-ing the wrapped command - server.js's
# process.env.* reads are unchanged, only where the values come from.
# --no-fallback: this container always has network access to Doppler at
# startup and doesn't need offline resilience, so there's no reason for it
# to write a secrets cache file to disk at all (also sidesteps needing to
# figure out a writable path for the non-root user above).
CMD ["doppler", "run", "--no-fallback", "--", "node", "server.js"]
