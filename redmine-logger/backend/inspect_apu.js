const XLSX = require('xlsx');
const fs = require('fs');

try {
    const fileName = 'APU-Off-line-Tracking-Sheet.xlsx';
    if (!fs.existsSync(fileName)) {
        console.log('File does not exist');
        process.exit(1);
    }
    const workbook = XLSX.readFile(fileName);

    console.log('SHEETS:', workbook.SheetNames);
    workbook.SheetNames.forEach(name => {
        const s = workbook.Sheets[name];
        console.log(`SHEET [${name}] - RANGE:`, s['!ref']);
        console.log(`SHEET [${name}] - COLS:`, JSON.stringify(s['!cols'] || []));
        console.log(`SHEET [${name}] - MERGES:`, JSON.stringify(s['!merges'] || []));
        const rows = XLSX.utils.sheet_to_json(s, { header: 1 });
        rows.slice(0, 3).forEach((r, i) => console.log(`  ROW ${i}:`, JSON.stringify(r)));
    });
} catch (e) {
    console.error(e);
}
