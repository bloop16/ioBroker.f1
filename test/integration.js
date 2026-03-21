const path = require("path");
const { tests } = require("@iobroker/testing");

// Run integration tests - this will test:
// - Adapter starts correctly
// - Adapter stops correctly
// - Package files are valid
tests.integration(path.join(__dirname, ".."));
