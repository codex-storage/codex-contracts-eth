FROM node:18.16.0-alpine3.17
WORKDIR /usr/app
COPY . .
RUN ["npm", "install"]
CMD ["sh", "docker/deploy.sh"]
