# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files and Prisma schema
COPY package.json package-lock.json ./
COPY prisma/ ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Stage 2: Runtime
FROM node:22-alpine AS run

WORKDIR /app

# Copy compiled output, node_modules, Prisma schema, and startup script
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/prisma/ ./prisma/
COPY --from=build /app/package.json ./
COPY start.sh ./start.sh

# Apply pending migrations, then start the bot
CMD ["sh", "start.sh"]
