
// Turns one value into a safe CSV cell.
function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);

  // Excel runs cells that start with = + - @ as formulas, so defuse them.
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  // Quote the cell if it has a comma, a quote or a line break.
  if (/[",\r\n]/.test(text)) {
    text = '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

// headers: array of column names, rows: array of arrays
function toCsv(headers, rows) {
  const lines = [headers.map(cell).join(',')];
  rows.forEach((row) => lines.push(row.map(cell).join(',')));
  return '\uFEFF' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8 correctly
}

module.exports = { cell, toCsv };
