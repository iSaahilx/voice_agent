FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --only=production && npm install --only=dev typescript ts-node

COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY static ./static

RUN npm run build

EXPOSE 3000

ENV PORT=3000

CMD ["node", "dist/index.js"]


