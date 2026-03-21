const fs = require('fs');
const path = require('path');

function getFolderSize(folderPath) {
  let size = 0;
  try {
    const stats = fs.statSync(folderPath);
    if (stats.isFile()) {
      return stats.size;
    }
    const files = fs.readdirSync(folderPath);
    for (let i = 0; i < files.length; i++) {
        const itemPath = path.join(folderPath, files[i]);
        try {
            const itemStats = fs.statSync(itemPath);
            if (itemStats.isDirectory()) {
                size += getFolderSize(itemPath);
            } else {
                size += itemStats.size;
            }
        } catch (e) {
            // Ignore errors
        }
    }
  } catch (e) {
      // Ignore errors
  }
  return size;
}

const dir = process.cwd();
const items = fs.readdirSync(dir);
const sizes = [];

for (const item of items) {
  const itemPath = path.join(dir, item);
  try {
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
        const size = getFolderSize(itemPath);
        sizes.push({ name: item, size: size, type: 'dir' });
    } else {
        sizes.push({ name: item, size: stat.size, type: 'file' });
    }
  } catch (e) {}
}

sizes.sort((a, b) => b.size - a.size);
sizes.slice(0, 10).forEach(i => {
    console.log(`${i.name}: ${(i.size / (1024 * 1024)).toFixed(2)} MB`);
});
