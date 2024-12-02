const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const swagger = require('./swagger');
const secureRoutes = require('./routes/secure');
const scriptRoutes = require('./routes/scripts');

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use('/auth', authRoutes);
app.use('/secure', secureRoutes);
app.use('/scripts', scriptRoutes);

swagger(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
