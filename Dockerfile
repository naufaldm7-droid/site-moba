# Server SITE CLASH untuk cloud (Hugging Face Spaces / layanan Docker lain).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY shared ./shared
COPY server ./server
COPY client ./client
ENV PORT=7860
EXPOSE 7860
USER node
CMD ["node", "server/index.js"]
