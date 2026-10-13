FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
RUN npm install

COPY . .
RUN npm run db:generate && npm run build -w @yozigo/api

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "run", "start", "-w", "@yozigo/api"]
