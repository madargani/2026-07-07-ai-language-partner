#!/bin/sh
# Apply pending Prisma migrations before starting the bot
npx prisma migrate deploy
# Start the compiled bot
node dist/index.js
