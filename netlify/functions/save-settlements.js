const { getStore } = require('@netlify/blobs');

const PASSWORD = 'Basebal1!11';

const CONTRACTS = ['K26','M26','N26','Q26','U26','V26','X26','Z26','F27','G27','H27'];
const MONTH_CODES = {
  F: 'Jan', G: 'Feb', H: 'Mar', J: 'Apr', K: 'May', M: 'Jun',
  N: 'Jul', Q: 'Aug', U: 'Sep', V: 'Oct', X: 'Nov', Z: 'Dec'
};

function parseContract(code) {
  const m = code.match(/([FGHJKMNQUVXZ])(\d{2,4})/);
  if (!m) return code;
  const mon = MONTH_CODES[m[1]] || m[1];
  const yr = m[2].length === 2 ? '20' + m[2] : m[2];
  return `${mon} ${yr}`;
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { password, date, prices } = body;

    if (password !== PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Wrong password' }) };
    }

    if (!date || !prices || prices.length !== CONTRACTS.length) {
      return { statusCode: 400, body: JSON.stringify({ error: `Need exactly ${CONTRACTS.length} prices` }) };
    }

    const store = getStore('natgas');
    const raw = await store.get('settlements');
    const existing = raw ? JSON.parse(raw) : { contracts: CONTRACTS.map(parseContract), days: [] };

    // Remove duplicate date if re-submitting same day
    existing.days = existing.days.filter(d => d.date !== date);

    // Add new day
    existing.days.push({ date, prices: prices.map(Number) });

    // Keep only last 10 days
    existing.days = existing.days.slice(-10);

    await store.set('settlements', JSON.stringify(existing));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, days: existing.days.length })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
