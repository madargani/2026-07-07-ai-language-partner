#!/bin/sh
npx prisma studio --port 5555 --hostname 0.0.0.0 &
exec npx tsx watch src/index.ts
