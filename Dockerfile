FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups && npm test
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/data/gifts.sqlite
USER node
EXPOSE 3000
CMD ["npm", "start"]
