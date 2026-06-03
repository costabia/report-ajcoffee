// api/coffee.js
export default async function handler(req, res) {
  // Pega as datas que o frontend enviou
  const { period1, period2 } = req.query;

  if (!period1 || !period2) {
    return res.status(400).json({ error: 'Parâmetros period1 e period2 são obrigatórios' });
  }

  // URL original do Yahoo Finance
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/KC%3DF?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;

  try {
    // Faz a requisição pelo servidor (Node.js não sofre bloqueio de CORS)
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance respondeu com status: ${response.status}`);
    }

    const data = await response.json();
    
    // Devolve os dados limpos para o seu frontend
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro na API Serverless:', error);
    res.status(500).json({ error: 'Falha ao buscar os dados do mercado' });
  }
}