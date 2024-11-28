const sql = require("mssql");

const config = {
  user: "MONITOR",
  password: "Thermal13",
  server: "81.133.236.250",
  port: 32795,
  database: "db1",
  options: {
    encrypt: false,               // Optional: disable to mimic SSMS "optional" encryption
    trustServerCertificate: true,  // Optional: trust the server certificate if self-signed
    enableArithAbort: true,
  },
};

async function connectToDatabase() {
  try {
    console.log("Attempting to connect to the database...");
    let pool = await sql.connect(config);
    console.log("Connected successfully!");

    // Test query to confirm data retrieval
    let result = await pool.request().query("SELECT TOP 1 * FROM dbo.companies");
    console.log("Sample data:", result.recordset);

    pool.close();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

connectToDatabase();
