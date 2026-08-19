const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'docs', 'ai-system-prompt.md');
const destinationDir = path.join(projectRoot, 'dist', 'docs');
const destination = path.join(destinationDir, 'ai-system-prompt.md');

if (!fs.existsSync(source)) {
  throw new Error(`AI system prompt source file not found: ${source}`);
}

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);
console.log(`Copied AI system prompt to ${destination}`);
