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

  // Dynamically determine the base URL
  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || 8080;
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

  // Set the server URL dynamically
  openApiSpec.servers = [
    { url: `${protocol}://${host}${process.env.NODE_ENV === 'production' ? '' : `:${port}`}`, description: 'Dynamic server' }
  ];

  // Serve Swagger UI for OpenAPI documentation
  app.use('/api-docs', swaggerAuth, swaggerUi.serve, swaggerUi.setup(openApiSpec));
};
