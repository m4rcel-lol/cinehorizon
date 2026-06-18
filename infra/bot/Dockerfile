# Always-on Discord bot. Tiny image; the token is passed at runtime via env,
# never baked in. Run with `--restart unless-stopped` for 24/7 uptime.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./
CMD ["node", "index.mjs"]
