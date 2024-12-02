const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path'); // Import path module
const { swaggerAuth } = require('./middleware/authMiddleware');

module.exports = (app) => {
  // Resolve the absolute path to the OpenAPI spec file
  const openApiSpecPath = path.resolve(__dirname, './openapi.yaml');
  
  // Load OpenAPI spec from the YAML file
  const openApiSpec = yaml.load(fs.readFileSync(openApiSpecPath, 'utf8'));

  // Get the PORT from the environment variable or default to 8080
  const PORT = process.env.PORT || 8080;

  // Dynamically set the server URL in the OpenAPI spec
  openApiSpec.servers = [
    { url: `http://localhost:${PORT}`, description: 'Local server' }
  ];

  // Serve Swagger UI for OpenAPI documentation
  app.use('/api-docs', swaggerAuth, swaggerUi.serve, swaggerUi.setup(openApiSpec));
};
