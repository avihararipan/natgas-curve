const https = require('https');

// CME API endpoint for Henry Hub Natural Gas settlements
const CME_URL = 'https://www.cmegroup.com/CmeWS/mvc/Settlements/futures/tradeDate/settled/productId/444/exchange/NYMEX/tradeDate/null/pageSize/10/isProtected';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.cmegroup.com/'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Failed to parse CME response')); }
      });
    }).on('error', reject);
  });
}

// Contract month codes
const MONTH_CODES = {
  F: 'Jan', G: 'Feb', H: 'Mar', J: 'Apr', K: 'May', M: 'Jun',
  N: 'Jul', Q: 'Aug', U: 'Sep', V: 'Oct', X: 'Nov', Z: 'Dec'
};

function parseContract(code) {
  // e.g. "K 2026" or "K26"
  const m = code.match(/([FGHJKMNQUVXZ])\s*(\d{2,4})/);
  if (!m) return code;
  const mon = MONTH_CODES[m[1]] || m[1];
  const yr = m[2].length === 2 ? '20' + m[2] : m[2];
  return `${mon} ${yr}`;
}

exports.handler = async function(event, context) {
  try {
    const raw = await fetchJSON(CME_URL);

    // CME returns settlement data grouped by trade date
    // Structure: { settlements: [ { tradeDate, entries: [ { contract, settle } ] } ] }
    const settlements = raw.settlements || raw.priceQuotes || [];

    if (!settlements.length) {
      throw new Error('No settlement data returned from CME');
    }

    // Take last 10 days
    const days = settlements.slice(-10).map(day => ({
      date: day.tradeDate || day.date,
      prices: (day.entries || day.quotes || []).map(e => parseFloat(e.settle || e.settlement || 0))
    }));

    // Get contract labels from first day
    const contracts = (settlements[0].entries || settlements[0].quotes || [])
      .map(e => parseContract(e.contract || e.symbol || ''));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify({ contracts, days })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
