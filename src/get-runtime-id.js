let elapsed = performance.now();
let counter = 0;

function getRuntimeID() {
  const now = performance.now();

  if (elapsed !== now) {
    elapsed = now;
    counter = 0;
  } else {
    counter++;
  }

  return elapsed + counter;
}

module.exports = {
  getRuntimeID,
};
