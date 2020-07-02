FROM node:alpine

COPY .env package*.json index.ts ./

RUN npm install

WORKDIR /output

ENTRYPOINT ["npm" , "start"]
