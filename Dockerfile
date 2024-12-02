# Use Node.js v20 as the base image
FROM node:20

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install project dependencies
RUN npm install --production

# Copy the rest of the project files to the container
COPY . .

# Expose the port your app runs on
EXPOSE 8080

# Start the application
CMD ["node", "src/app.js"]
