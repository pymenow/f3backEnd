const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "auth-fa6e5",
});

const auth = admin.auth();

module.exports = { admin, auth };