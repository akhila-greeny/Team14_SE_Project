# OIPP backend container image (built and published by the CI/CD pipeline).
FROM node:22-alpine
WORKDIR /app

# Install only production dependencies, using the exact versions in the lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# HTTP inside the container; HTTPS is terminated by the hosting platform
# (see docs/deviations.md). NODE_ENV is not set to "production" because
# server.js refuses to start in production without a TLS certificate.
ENV HTTP_PORT=3000
EXPOSE 3000

# Run as the non-root "node" user that the official image provides.
USER node
CMD ["node", "server.js"]
