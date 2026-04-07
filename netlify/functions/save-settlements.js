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

function toYMD(dateStr) {
  // Handles both "2026-04-06" and "04/06/2026"
  if (!dateStr) return '';
  if (dateStr.includes('-')) return dateStr.trim();
  const parts = dateStr.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  return dateStr.trim();
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

    const normalizedDate = toYMD(date);
    const normalizedPrices = prices.map(p => {
      const n = parseFloat(String(p).replace(',', '.'));
      // If price looks like it's missing decimal (e.g. 2811 instead of 2.811)
      return n > 100 ? n / 1000 : n;
    });

    const store = getStore({
      name: 'natgas',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });

    let existing;
    try {
      const raw = await store.get('settlements');
      existing = raw ? JSON.parse(raw) : null;
    } catch(e) {
      existing = null;
    }

    if (!existing) {
      existing = { contracts: CONTRACTS.map(parseContract), days: [] };
    }

    // Remove any entry with same date (normalize all stored dates too)
    existing.days = existing.days.filter(d => toYMD(d.date) !== normalizedDate);

    // Also fix any existing bad prices (>100 means missing decimal)
    existing.days = existing.days.map(d => ({
      ...d,
      date: toYMD(d.date),
      prices: d.prices.map(p => p > 100 ? p / 1000 : p)
    }));

    // Add new day
    existing.days.push({ date: normalizedDate, prices: normalizedPrices });

    // Sort by date and keep last 10
    existing.days.sort((a, b) => a.date.localeCompare(b.date));
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
