const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { middleware } = require('express-openapi-validator');
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser'); // Import SwaggerParser
const swagger = require('./swagger');
const authRoutes = require('./routes/auth');
const secureRoutes = require('./routes/secure');
const scriptRoutes = require('./routes/scripts');
const userRoutes = require('./routes/user');

const app = express();
app.use(bodyParser.json());
app.use(cors());

(async () => {
  try {
    // Dereference the OpenAPI spec
    const openApiSpecPath = path.resolve(__dirname, './openapi.yaml');
    const dereferencedSpec = await SwaggerParser.dereference(openApiSpecPath);

    // Serve Swagger UI
    swagger(app);

    // Use OpenAPI Validator middleware with the dereferenced spec
    app.use(
      middleware({
        apiSpec: dereferencedSpec,
        validateRequests: true,
        validateResponses: false,
        ignorePaths: /\/api-docs/, // Exclude Swagger UI requests
      })
    );

    // API Routes
    app.use('/auth', authRoutes);
    app.use('/secure', secureRoutes);
    app.use('/scripts', scriptRoutes);
    app.use('/user', userRoutes);

    // Error Handling Middleware
    app.use((err, req, res, next) => {
      if (err.status) {
        res.status(err.status).json({
          message: err.message,
          errors: err.errors,
        });
      } else {
        console.error(err);
        res.status(500).json({
          message: 'Internal Server Error',
        });
      }
    });

    // Start the server
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('Error dereferencing OpenAPI spec:', error.message);
    process.exit(1);
  }
})();
