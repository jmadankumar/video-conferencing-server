const path = require('path');
const fs = require('fs');

const destination = 'build';
const filesToCopy = ['package.json', 'yarn.lock'];

async function copy() {
  const dir = process.cwd();
  filesToCopy.forEach((file) => {
    fs.copyFileSync(path.resolve(dir, file), path.resolve(dir, destination, file));
  });
}
module.exports = copy;
