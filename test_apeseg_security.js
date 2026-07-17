const axios = require('axios');

async function testApeseg() {
  const placa = 'BAB215';
  
  // Test 1: Intento sin CF-Turnstile-Response ni Authorization
  try {
    console.log('--- TEST 1: Sin tokens ---');
    const res1 = await axios.get(`https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${placa}`, {
      headers: {
        'Accept': '*/*',
        'Origin': 'https://webapp.apeseg.org.pe',
        'Referer': 'https://webapp.apeseg.org.pe/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Source': 'apeseg'
      }
    });
    console.log('Status 1:', res1.status);
    console.log('Data 1:', res1.data);
  } catch (err) {
    console.log('Error 1:', err.response ? err.response.status : err.message);
  }

  // Test 2: Intento solo con el Bearer Token del usuario (si aun no ha expirado)
  try {
    console.log('\n--- TEST 2: Solo con Bearer Token ---');
    const res2 = await axios.get(`https://api.apeseg.org.pe/consulta-soat/api/certificados/placa/${placa}`, {
      headers: {
        'Accept': '*/*',
        'Authorization': 'Bearer 8731204|sCOD3LnVBTPTOKox5qBxkZvGrQLBYcQlbJM1JxQF7ad71ca4',
        'Origin': 'https://webapp.apeseg.org.pe',
        'Referer': 'https://webapp.apeseg.org.pe/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Source': 'apeseg'
      }
    });
    console.log('Status 2:', res2.status);
    console.log('Data 2:', res2.data);
  } catch (err) {
    console.log('Error 2:', err.response ? err.response.status : err.message);
  }
}

testApeseg();
