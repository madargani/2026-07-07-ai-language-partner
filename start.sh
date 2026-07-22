#!/bin/sh
# Apply pending Prisma migrations before starting the bot
npx prisma migrate deploy
# Regenerate Prisma client to match schema (fixes stale client after schema changes)
npx prisma generate
# Start the compiled bot
node dist/index.js
