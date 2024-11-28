const net = require('net');
const crc32 = require('crc-32');
const { fetchCompaniesAndSerials } = require('./getSensors');
const mqtt = require('mqtt');

const HOST = '0.0.0.0';
const PORT_RANGE_START = 11102;
const PORT_RANGE_END = 11105;

// MQTT Client setup
const mqttClient = mqtt.connect('mqtt://81.133.236.250'); // Replace with your MQTT broker address

mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
});

let companyData = [];

// Retry fetching company data until successful
async function initializeCompanyData() {
    console.log("Attempting to fetch company data for processing...");
    while (true) {
        try {
            companyData = await fetchCompaniesAndSerials();
            if (companyData && companyData.length > 0) {
                console.log("Successfully fetched company data for processing.");
                break;
            }
        } catch (error) {
            console.error("Error fetching company data, retrying in 5 seconds:", error.message);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Start servers only after successful data fetch
function startServers() {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
        createServer(port);
    }
    console.log("Servers successfully started on ports", PORT_RANGE_START, "to", PORT_RANGE_END);
}

function createServer(port) {
    const server = net.createServer((socket) => {
        console.log(`Connected: ${socket.remoteAddress}:${socket.remotePort}`);
        
        let buffer = '';

        socket.on('data', (data) => {
            buffer += data.toString();
            try {
                const parsedMessage = JSON.parse(buffer);

                // Suppress SL command from output
                if (parsedMessage.cd === 'sl') {
                    console.log('SL command received but suppressed from output.');
                    buffer = ''; // Clear buffer to prepare for the next message
                    return;
                }

                console.log(`Handling request: ${JSON.stringify(parsedMessage, null, 2)}`);
                handleRequest(parsedMessage, socket);
                buffer = ''; // Clear buffer after handling the message
            } catch (error) {
                if (!(error instanceof SyntaxError)) {
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

// Function to encode each serial number in the required format for TS
function encodeSerialNumberToHex(serialNumber) {
    return serialNumber
        .match(/../g)
        .reverse()
        .map((pair) => parseInt(pair, 16).toString(16).padStart(2, '0'))
        .join('');
}

function generateTSString(sensorSerials) {
    const hexSegments = sensorSerials.map(encodeSerialNumberToHex);
    const combinedHex = hexSegments.join('');
    const tsString = Buffer.from(combinedHex, 'hex').toString('base64');
    return tsString + '==';
}

// Parse and publish data to MQTT
// Parse and publish data to MQTT
// Parse and publish data to MQTT
function parseAndPublishData(companyName, baseSerial, sensorData) {
    const formattedData = sensorData.map(sensor => {
        const temperature = sensor.cs.find(channel => channel.c === 0 && channel.t === 1)?.d;
        const formattedTemperature = temperature ? (parseInt(temperature, 16) / 10).toFixed(2) : "N/A";

        // Remove leading zeros from serial number
        const trimmedSerialNumber = sensor.sn.replace(/^0+/, '');

        // Format timestamp to "YYYY/MM/DD HH:MM:SS"
        const formattedTimestamp = sensor.dt.replace(/T/, ' ').replace(/Z/, '').replace(/-/g, '/');

        const payload = {
            temperature: formattedTemperature,
            serialNumber: trimmedSerialNumber,
            timestamp: formattedTimestamp,
            firmwareVersion: "1.0.0", // Set a default firmware version, update if available
            Voltage: (sensor.bt / 100).toFixed(2)
        };

        // Publish with "thermalsystems" prefix and trimmed serial number
		//const topic = `thermalsystems/${baseSerial}/${trimmedSerialNumber}`;
        const topic = `thermalsystems/111213/${trimmedSerialNumber}`;
        mqttClient.publish(topic, JSON.stringify(payload));
        console.log(`Published to ${topic}:`, JSON.stringify(payload));
    });
}




async function handleRequest(message, socket) {
    let response = {};

    if (message.cd === 'dt') {
        // Handle "dt" command without requiring a base serial number
        console.log('Received "dt" command. Responding with UTC timestamp.');
        response = {
            utc: new Date().toISOString()
        };
        console.log('Sending response:', response);
        socket.write(JSON.stringify(response));
        return;
    }

    if (message.cd && message.bs) {
        const baseSerial = message.bs;
        console.log(`Received base serial number: ${baseSerial}`);

        const companyMatch = companyData.find(company => 
            company.baseUnits.includes(baseSerial)
        );

        if (companyMatch) {
            console.log(`Match found for base serial number ${baseSerial} in company: ${companyMatch.company}`);
            console.log(`Associated sensors: ${companyMatch.sensors.join(', ')}`);
            
            // Generate ts string based on matching sensors
            const tsString = generateTSString(companyMatch.sensors);

            switch (message.cd) {
                case 'or':
                case 'gs':
                    response = {
                        r: 'ack',
                        ts: tsString
                    };
                    break;
                case 'dt':
                    response = {
                        utc: new Date().toISOString()
                    };
                    break;
                case 'pv':
                case 'pu':
                    const messageString = JSON.stringify(message);
                    const crcValue = crc32.str(messageString);
                    response = {
                        r: 'ack',
                        ts: Buffer.from(crcValue.toString()).toString('base64')
                    };
                    break;
                case 'id':
                    if (message.id && message.id.m) {
                        parseAndPublishData(companyMatch.company, baseSerial, message.id.m);
                    }
                    response = {
                        r: 'ack',
                        ts: tsString // Respond with the same tsString
                    };
                    break;
                default:
                    response = { error: 'Unknown message type' };
            }

            console.log('Sending response:', response);
            socket.write(JSON.stringify(response));
        } else {
            console.log(`No matching company found for base unit: ${baseSerial}`);
            response = { error: 'No matching sensors found' };
            socket.write(JSON.stringify(response));
        }
    } else {
        console.error('Invalid message format or missing base serial number.');
        response = { error: 'Invalid message format or missing base serial number' };
        socket.write(JSON.stringify(response));
    }
}

// Initialize, fetch company data, and start servers only when data fetch is successful
initializeCompanyData()
    .then(startServers)
    .catch((error) => {
        console.error("Failed to initialize company data:", error);
    });
