require("dotenv").config();
require("tsx/cjs");

const { Client } = require("pg");
const { runIraqTaxonomyReclassifier } = require("./iraq-taxonomy-migration-lib.cjs");

runIraqTaxonomyReclassifier({
  Client,
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: process.env,
  logger: console,
}).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
