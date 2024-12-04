const swaggerUi = require('swagger-ui-express');
const SwaggerParser = require('@apidevtools/swagger-parser');
const path = require('path');
const { swaggerAuth } = require('./middleware/authMiddleware');

module.exports = async (app) => {
  const openApiSpecPath = path.resolve(__dirname, './openapi.yaml');

  try {
    // Dereference the OpenAPI spec
    const dereferencedSpec = await SwaggerParser.dereference(openApiSpecPath);

    // Dynamically determine the base URL
    const host = process.env.HOST || 'localhost';
    const port = process.env.PORT || 3001;
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

    // Add the servers dynamically
    dereferencedSpec.servers = [
      { url: `${protocol}://${host}${process.env.NODE_ENV === 'production' ? '' : `:${port}`}`, description: 'Dynamic server' },
    ];

    // Serve Swagger UI
    app.use('/api-docs', swaggerAuth, swaggerUi.serve, swaggerUi.setup(dereferencedSpec));
    console.log('Swagger UI is available at /api-docs');
  } catch (err) {
    console.error('Error loading OpenAPI spec:', err.message);
    process.exit(1);
  }
};
