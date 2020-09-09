const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const copy = require('./copy');

const workingDir = process.cwd();
const dirToZip = path.resolve(workingDir, 'build');

async function zip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(path.join(workingDir, 'build.zip'));
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', function () {
      resolve();
    });
    archive.on('error', function (err) {
      reject(err);
    });
    archive.directory(dirToZip, false).pipe(output);

    archive.finalize();
  });
}

async function build() {
  await copy();
  await zip();
}

build();
