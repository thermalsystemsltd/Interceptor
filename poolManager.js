const sql = require("mssql");
const config = require("./db-config");

let activePool = null;

module.exports = {
  initializeConfig: async () => {
    try {
      activePool = await sql.connect(config);
      console.log("Pool connected successfully!");
    } catch (error) {
      console.error("Error initializing pool configurations:", error);
    }
  },
  getPool: () => activePool,
  closePool: async () => {
    if (activePool) {
      await activePool.close();
      console.log("Pool closed.");
    }
  },
};
