const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

async function generateReport(results, outputPath) {
  const templatePath = path.join(__dirname, 'report.ejs');
  const templateStr = fs.readFileSync(templatePath, 'utf-8');
  
  const total = results.length;
  const passed = results.filter(r => r.isMatch).length;
  const failed = total - passed;
  
  const html = await ejs.render(templateStr, {
    results,
    summary: { total, passed, failed }
  }, { async: true });

  fs.writeFileSync(outputPath, html);
  console.log(`\n✅ Report generated successfully: ${outputPath}`);
}

module.exports = { generateReport };
