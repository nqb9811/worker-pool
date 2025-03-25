let timestamp = Date.now();
let counter = 0;

function getRuntimeID() {
  const now = Date.now();

  if (timestamp !== now) {
    timestamp = now;
    counter = 0;
  } else {
    counter++;
  }

  return `${timestamp}.${counter}`;
}

module.exports = {
  getRuntimeID,
};
