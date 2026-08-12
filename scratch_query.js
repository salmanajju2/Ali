const fs = require('fs');
const dump = JSON.parse(fs.readFileSync('d1_dump.json', 'utf8'));
const results = dump.transactions.filter(tx => tx.bank && tx.bank.includes('SPICEMONEY'));
console.log(JSON.stringify(results.slice(0, 10), null, 2));
