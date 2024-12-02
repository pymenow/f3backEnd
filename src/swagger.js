const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path'); // Import path module

module.exports = (app) => {
  // Resolve the absolute path to the OpenAPI spec file
  const openApiSpecPath = path.resolve(__dirname, './openapi.yaml');
  
  // Load OpenAPI spec from the YAML file
  const openApiSpec = yaml.load(fs.readFileSync(openApiSpecPath, 'utf8'));

  // Serve Swagger UI for OpenAPI documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
};
