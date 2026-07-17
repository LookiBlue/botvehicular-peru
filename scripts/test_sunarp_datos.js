const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  console.log('Probando API Gateway SUNARP - getDatosVehiculo');
  try {
    const res = await axios.post(
      'https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo',
      {
        "placa": "CKR477",
        "captcha": "test"
      },
      {
        httpsAgent,
        headers: {
          'accept': 'application/json, text/plain, */*',
          'origin': 'https://consultavehicular.sunarp.gob.pe',
          'referer': 'https://consultavehicular.sunarp.gob.pe/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
          'x-ibm-client-id': '70574c7d9194834316a156b1d68fdb90'
        },
        timeout: 10000
      }
    );
    console.log('Status:', res.status);
    console.log('Data:', res.data);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Data:', error.response.data);
    }
  }
}

run();
