const sql = require("mssql");

const mainConfig = {
  user: "MONITOR",
  password: "Thermal13",
  server: "81.133.236.250",
  port: 32795,
  database: "db1",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 5000,
    requestTimeout: 5000,
  },
};

async function connectWithRetry(config, retries = 3) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const pool = await sql.connect(config);
      return pool;
    } catch (error) {
      attempt++;
      console.warn(`Connection attempt ${attempt} failed: ${error.message}`);
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function fetchCompaniesAndSerials() {
  console.log("Attempting to connect to the main server...");
  const companySerials = [];

  try {
    const mainPool = await connectWithRetry(mainConfig);
    console.log("Connected to the main server.\n");

    const companyQuery = "SELECT name, dbUser, dbPassword, dbHost, dbName FROM dbo.companies";
    const companiesResult = await mainPool.request().query(companyQuery);
    await mainPool.close();

    if (companiesResult.recordset.length === 0) {
      console.log("No companies found.");
      return companySerials;
    }

    for (const company of companiesResult.recordset) {
      const clientConfig = {
        user: company.dbUser,
        password: company.dbPassword,
        server: mainConfig.server,
        port: mainConfig.port,
        database: company.dbName,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          connectTimeout: 5000,
          requestTimeout: 5000,
        },
      };

      try {
        const clientPool = await connectWithRetry(clientConfig, 3);
        console.log(`Connected to ${company.name}'s database.`);

        const baseUnitsQuery = "SELECT serialNo FROM dbo.base_units WHERE serialNo LIKE '40%'";
        const baseUnitsResult = await clientPool.request().query(baseUnitsQuery);

        const baseUnits = baseUnitsResult.recordset.map((unit) =>
          unit.serialNo.toString().padStart(8, "0")
        );

        const sensorsQuery = "SELECT serialNo FROM dbo.sensors WHERE type = 2";
        const sensorsResult = await clientPool.request().query(sensorsQuery);

        const sensors = sensorsResult.recordset.map((sensor) =>
          sensor.serialNo.toString().padStart(8, "0")
        );

        companySerials.push({ company: company.name, baseUnits, sensors });
        await clientPool.close();
      } catch (err) {
        console.error(`Error accessing ${company.name}'s database:`, err);
      }
    }
    console.log("\nFetched serial numbers for companies:", companySerials);
    return companySerials;
  } catch (error) {
    console.error("Error connecting to the main server or fetching companies:", error);
  }
}

module.exports = { fetchCompaniesAndSerials };
