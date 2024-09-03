const net = require('net');
const crc32 = require('crc-32');
const sql = require('mssql');

const sqlConfig = {
    user: "MONITOR",
    password: "Thermal13",
    database: 'db1',
    server: '192.168.1.221',
    port: 1433,
    options: {
        encrypt: false,
        enableArithAbort: true,
        instanceName: 'DBSERVER'
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 60000
    }
};

const HOST = '0.0.0.0';
const PORT_RANGE_START = 10997;
const PORT_RANGE_END = 11105;

function createServer(port) {
    const server = net.createServer((socket) => {
        console.log(`Connected: ${socket.remoteAddress}:${socket.remotePort}`);

        let buffer = '';

        socket.on('data', (data) => {
            console.log(`Received data chunk: ${data.toString()}`);
            buffer += data.toString();

            try {
                const parsedMessage = JSON.parse(buffer);
                console.log(`Parsed JSON: ${JSON.stringify(parsedMessage, null, 2)}`);
                handleRequest(parsedMessage, socket);
                buffer = '';
            } catch (error) {
                if (error instanceof SyntaxError) {
                    console.log('Waiting for more data...');
                } else {
                    console.error('Error parsing message:', error.message);
                    socket.write(JSON.stringify({ error: 'Invalid JSON format' }));
                    buffer = '';
                }
            }
        });

        socket.on('close', () => {
            console.log(`Closed connection with: ${socket.remoteAddress}:${socket.remotePort}`);
        });

        socket.on('error', (err) => {
            console.error(`Socket error: ${err.message}`);
        });
    });

    server.listen(port, HOST, () => {
        console.log(`Server running at ${HOST}:${port}`);
    });
}

for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    createServer(port);
}

function formatSerialNumber(sn) {
    return sn.match(/.{1,2}/g).join('.');
}

function formatBatteryLevel(bt) {
    return (bt / 100).toFixed(2) + 'V';
}

function formatTemperature(decodedValue) {
    if (decodedValue === 0x8082) {
        return 'No Signal';
    } else {
        return (decodedValue / 10).toFixed(1) + 'C';
    }
}

async function handleRequest(message, socket) {
    try {
        console.log(`Handling request: ${JSON.stringify(message, null, 2)}`);
        let response = {};

        switch (message.cd) {
            case 'or':
                await handleBaseUnitConnection(message.bs, socket);
                response = { r: 'ack' };
                break;

            case 'dt':
                response = { utc: new Date().toISOString() };
                break;

            case 'pv':
            case 'pu': // Treat 'pu' the same as 'pv'
                const messageString = JSON.stringify(message);
                const crcValue = crc32.str(messageString);
                const tsValue = Buffer.from(crcValue.toString()).toString('base64');

                response = {
                    r: 'ack',
                    ts: tsValue
                };
                break;

            case 'gs':
                response = {
                    r: 'ack',
                    ts: 'WGMAACAkAABIOAEASREAAFUyAgAGBzP/BQM0/05CNP88Mzj/YEk4/yNaOP8FBTn/DwU5/0VSAQBgYQEAFUkDAJd3AQBkgQEAF4MBABaDAQCBYAEAkoIBAGOBAQBGgQEAN4MBAIeCAQCCYAEAM4MBAAmJAQCRggEAg2ABAIiCAQAVgwEAcUkBAJCCAQCJggEANIMBAGKBAQAygwEAYYEBABKSAgCUkQIAdIgCAHGIAgCDiAIAlZECABCSAgAJkgIAmZECAJiRAgAAkgIAlpECABOSAgCEiAIAc4gCAAKBAgCAiAIAIZECACWRAgAmkQIAGZECACSRAgAgkQIAQIICACeRAgAikQIAEJECABeRAgAVkQIAQYICADGDAQAlEQAABxgAABQRAABEEgAAQxIAAEcSAABJEgAARhIAAGISAABjEgAAYRIAAEUSAACRQgIAQhIAAEgSAABREgAAJzcCAJcEBAAnUAMACEgDAAlIAwB5WQMAgFkDAIFZAwAHYAMAeFkDAIJZAwAEBQQAmAQEAAGSAgApInQAEZICAAEEBACXAwQAeAMEAJgDBACBAwQAGAQEAHYDBAB1BQQAZgUEAGgFBABnBQQAAZUCAJiSAgCXlAIABZUCAAmVAgAIkwIAk1UDAGaDAgBElAIAcZcCAJdVAwBHlAIAWYMCAHeXAgBwlwIAaQUEADcQBAB5FAQAABcEAAgXBAARERER'
                };
                break;

            case 'sl':
                response = { r: 'ack' };
                break;

            case 'id':
                message.id.m.forEach(sensorData => {
                    sensorData.cs.forEach(controlSetting => {
                        controlSetting.decodedValue = parseInt(controlSetting.d, 16);
                    });

                    const formattedSn = formatSerialNumber(sensorData.sn);
                    const formattedBt = formatBatteryLevel(sensorData.bt);
                    const datetime = sensorData.dt;

                    console.log(`Sensor SN: ${formattedSn}, DateTime: ${datetime}, SG: ${sensorData.sg}, Battery: ${formattedBt}, Decoded Data:`);

                    sensorData.cs.forEach(controlSetting => {
                        if (controlSetting.t === 1) {
                            const temperature = formatTemperature(controlSetting.decodedValue);
                            console.log(`Temperature: ${temperature}`);
                        } else {
                            console.log(controlSetting);
                        }
                    });

                    console.log('');
                });

                const messageStringId = JSON.stringify(message);
                const crcValueId = crc32.str(messageStringId);
                const tsValueId = Buffer.from(crcValueId.toString()).toString('base64');

                response = {
                    r: 'ack',
                    ts: tsValueId
                };
                break;

            default:
                response = { error: 'Unknown message type' };
        }

        console.log(`Sending response: ${JSON.stringify(response, null, 2)}`);
        socket.write(JSON.stringify(response));
    } catch (error) {
        console.error('Failed to process message', error);
        socket.write(JSON.stringify({ error: 'Invalid JSON format' }));
    }
}


async function handleBaseUnitConnection(baseUnitId, socket) {
    try {
        await sql.connect(sqlConfig);
        const request = new sql.Request();

        // Check if baseUnitId exists in the BaseUnits table
        const result = await request.query(`SELECT CompanyId FROM dbo.BaseUnits WHERE baseUnitId = '${baseUnitId}'`);

        if (result.recordset.length > 0) {
            const companyId = result.recordset[0].CompanyId;

            // Now get the company name from the companies table
            const companyResult = await request.query(`SELECT name FROM dbo.companies WHERE id = '${companyId}'`);
            const companyName = companyResult.recordset.length > 0 ? companyResult.recordset[0].name : 'Unknown Company';

            console.log(`Base Unit ID: ${baseUnitId} belongs to Company: ${companyName}`);
        } else {
            console.log(`Base Unit ID: ${baseUnitId} not found in the database.`);
        }
    } catch (err) {
        console.error('Database operation failed:', err);
    }
}
