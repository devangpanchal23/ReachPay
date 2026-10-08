import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const metadata = require('libphonenumber-js/metadata.max.json');
const limits = Object.fromEntries(Object.entries(metadata.countries).map(([country, data]) => {
  const internationalLimit = 15 - data[0].length;
  const validLengths = data[3].filter((length) => Number.isInteger(length) && length > 0);
  const maximumPossibleLength = validLengths.length ? Math.max(...validLengths) : internationalLimit;
  return [country, country === 'IN' ? 10 : Math.min(internationalLimit, maximumPossibleLength)];
}));
await writeFile(new URL('../shared/phone-national-lengths.js', import.meta.url), `export default ${JSON.stringify(limits)};\n`);
console.log('Updated shared phone national-number length limits.');
