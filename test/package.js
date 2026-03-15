/* global describe, it */
const path = require("path");
const { tests } = require("@iobroker/testing");

// Validate package files
tests.packageFiles(path.join(__dirname, ".."));
