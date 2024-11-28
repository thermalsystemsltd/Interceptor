const pm = require("./poolManager");

async function loadBaseUnits() {
  try {
    const poolsConfig = await pm.getAll();
    const poolPromises = poolsConfig.map(async (companyName) => {
      const pool = await pm.getPool(companyName);
      const result = await pool.request().query(`SELECT serialNo FROM dbo.base_units WHERE is_deleted = 'false'`);
      
      // Filter for specific serial number structure (e.g., "40001918")
      const filteredUnits = result.recordset.filter(record => /^4000\d{4}$/.test(record.serialNo));
      
      // Output company name and serial numbers for matching base units
      if (filteredUnits.length > 0) {
        console.log(`\nCompany: ${companyName}`);
        filteredUnits.forEach(record => console.log(`- Base Unit Serial Number: ${record.serialNo}`));
      }
    });
    
    await Promise.all(poolPromises);
  } catch (error) {
    console.error("Error loading base units:", error);
  }
}

module.exports = { loadBaseUnits };
