const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const fileContent = fs.readFileSync(path.join(__dirname, 'src/database/migrations/0000_living_lila_cheney.sql'), 'utf8');
const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
console.log('Computed hash of 0000:', hash);
console.log('Database hash for id 1 should be:', '063fd1075657b513b15008a9b64ed39c4027c34ed33aacd1708e406d8763b164');
if (hash === '063fd1075657b513b15008a9b64ed39c4027c34ed33aacd1708e406d8763b164') {
  console.log('MATCH!');
} else {
  console.log('NO MATCH!');
}
