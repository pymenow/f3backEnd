const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { middleware } = require('express-openapi-validator'); // Correct import
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const swagger = require('./swagger');
const authRoutes = require('./routes/auth');
const secureRoutes = require('./routes/secure');
const scriptRoutes = require('./routes/scripts');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Load OpenAPI specification using absolute path
const openApiSpecPath = path.resolve(__dirname, './openapi.yaml');
const openApiSpec = yaml.load(fs.readFileSync(openApiSpecPath, 'utf8'));

// Serve Swagger UI for API documentation
swagger(app);

// Use express-openapi-validator middleware for request/response validation
app.use(
  middleware({
    apiSpec: openApiSpecPath,
    validateRequests: true, // Validate request bodies, headers, etc.
    validateResponses: true, // Validate responses
  })
);

// API Routes
app.use('/auth', authRoutes);
app.use('/secure', secureRoutes);
app.use('/scripts', scriptRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  if (err.status) {
    res.status(err.status).json({
      message: err.message,
      errors: err.errors,
    });
  } else {
    console.error(err); // Log unexpected errors for debugging
    res.status(500).json({
      message: 'Internal Server Error',
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/api-docs`);
});
