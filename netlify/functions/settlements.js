const https = require('https');

const MONTH_CODES = {
  F: 'Jan', G: 'Feb', H: 'Mar', J: 'Apr', K: 'May', M: 'Jun',
  N: 'Jul', Q: 'Aug', U: 'Sep', V: 'Oct', X: 'Nov', Z: 'Dec'
};

function parseContract(code) {
  const m = code.match(/([FGHJKMNQUVXZ])\s*(\d{2,4})/);
  if (!m) return code;
  const mon = MONTH_CODES[m[1]] || m[1];
  const yr = m[2].length === 2 ? '20' + m[2] : m[2];
  return `${mon} ${yr}`;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.cmegroup.com/'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Failed to parse response: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

exports.handler = async function(event, context) {
  try {
    // Fetch last 10 trading days of settlements for Henry Hub (product 444)
    const url = 'https://www.cmegroup.com/CmeWS/mvc/Settlements/futures/tradeDate/settled/productId/444/exchange/NYMEX/pageSize/10';
    const raw = await fetchJSON(url);

    // Log structure to help debug
    console.log('CME response keys:', Object.keys(raw));
    console.log('CME sample:', JSON.stringify(raw).substring(0, 500));

    // CME returns: { settlements: [ { tradeDate, prices: [ { contract, settle } ] } ] }
    // or: { priceQuotes: [...] }
    // Try multiple possible structures
    let settlementDays = raw.settlements || raw.priceQuotes || raw.data || [];

    if (!Array.isArray(settlementDays) || settlementDays.length === 0) {
      // Maybe it's nested differently — try one level deeper
      const firstKey = Object.keys(raw).find(k => Array.isArray(raw[k]) && raw[k].length > 0);
      if (firstKey) settlementDays = raw[firstKey];
    }

    if (!settlementDays.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ debug: raw, error: 'Could not parse CME structure' })
      };
    }

    // Target contracts: K26 through H27 (same as your original data)
    const TARGET = ['K26','M26','N26','Q26','U26','V26','X26','Z26','F27','G27','H27'];

    const days = settlementDays.slice(-10).map(day => {
      const entries = day.prices || day.entries || day.quotes || day.settlements || [];
      const prices = TARGET.map(code => {
        const entry = entries.find(e => {
          const sym = (e.contract || e.symbol || e.expirationCode || '').replace(/\s/g, '');
          return sym === code || sym.includes(code);
        });
        return entry ? parseFloat(entry.settle || entry.settlement || entry.price || 0) : null;
      });
      return { date: day.tradeDate || day.date || day.settlementDate, prices };
    }).filter(d => d.prices.some(p => p !== null));

    const contracts = TARGET.map(parseContract);

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
