// Keep Puppeteer's downloaded Chrome inside the deployed application image.
// The same path is used during Google Cloud Build and at Cloud Run runtime.
const path = require('node:path');

module.exports = {
  cacheDirectory: path.join(__dirname, '.cache', 'puppeteer'),
};
