const path = require("path");
const { tests } = require("@iobroker/testing");

// Run unit tests - add custom unit tests here later
tests.unit(path.join(__dirname, ".."));
