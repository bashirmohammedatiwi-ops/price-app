FROM node:20-bullseye-slim

WORKDIR /app

# better-sqlite3 may need build tools in some environments.
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/prices.sqlite

VOLUME ["/data"]

EXPOSE 5000

CMD ["npm", "start"]

