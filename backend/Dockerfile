FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/api/server.js"]
