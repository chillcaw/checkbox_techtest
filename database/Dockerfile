FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY seed.js ./

CMD ["npm", "run", "seed"]

