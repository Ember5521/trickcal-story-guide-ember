const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, 'background.jpg');
const dest = path.join(__dirname, 'public', 'background.jpg');

try {
    fs.copyFileSync(source, dest);
    console.log('Successfully copied background.jpg to public/');
} catch (err) {
    console.error('Error copying file:', err);
}
