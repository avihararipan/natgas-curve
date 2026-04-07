const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
  try {
    const store = getStore({
      name: 'natgas',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });

    let raw;
    try {
      raw = await store.get('settlements');
    } catch(e) {
      raw = null;
    }

    if (!raw) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ contracts: [], days: [] })
      };
    }

    const data = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
