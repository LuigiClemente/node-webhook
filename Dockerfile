# Use the official Node.js image as the base
FROM node:18-alpine

# Set the working directory within the container
WORKDIR /usr/src/app

RUN npm install -g ts-node

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on (e.g., 3000)
EXPOSE 3000

# Define the command to run your application
CMD [ "ts-node", "server" ]