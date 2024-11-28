function createTsString(serials) {
  const hexSegments = serials.map(serial => {
    const [part1, part2, part3] = serial.split('.');
    const hexPart1 = parseInt(part1).toString(16).padStart(2, '0');
    const hexPart2 = parseInt(part2).toString(16).padStart(2, '0');
    const hexPart3 = parseInt(part3).toString(16).padStart(2, '0');
    return hexPart3 + hexPart2 + hexPart1 + "ff";
  });
  const binaryData = Buffer.from(hexSegments.join(''), 'hex');
  return binaryData.toString('base64');
}

module.exports = { createTsString };
