let timestamp = Date.now();
let fraction = 1;

function getRuntimeID() {
  const now = Date.now();

  if (now !== timestamp) {
    timestamp = now;
    fraction = 1;
    return timestamp;
  }

  fraction = fraction / 10;

  return timestamp + fraction;
}

module.exports = {
  getRuntimeID,
};
