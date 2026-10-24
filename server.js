const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

function respond(res, status, data, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(data);
}

function generateRuleBasedPlan(zone, housing, members, concern) {
  return `### Plan Familiar de Prevención y Evacuación (Zona: ${zone})

1. Rutas y Evacuacion Segura:
   - Dado el entorno (${housing}) y los integrantes (${members}), defina una ruta hacia zonas altas lejos de cauces o quebradas.
   - Establezca un punto de encuentro seguro a no menos de 200 metros de áreas vulnerables a huaicos o desbordes.

2. Acciones Inmediatas en el Hogar:
   - Ante la preocupación principal (${concern}): asegure techos, limpie canaletas y coloque sacos de arena en las puertas de ingreso.
   - Coloque documentos importantes y medicinas en bolsas plásticas herméticas e impermeables.

3. Mochila de Emergencia Priorizada:
   - Agua embotellada (mínimo 2 litros por persona), alimentos no perecibles, linterna con baterías de repuesto y silbato.
   - Botiquín con medicamentos específicos para los integrantes del hogar y ropa de abrigo impermeable.

4. Monitoreo y Canales Oficiales:
   - Siga permanentemente las indicaciones de INDECI y los avisos meteorológicos de SENAMHI a través de la radio local.`;
}

function callOpenAI(zone, housing, members, concern) {
  return new Promise((resolve, reject) => {
    if (!OPENAI_API_KEY) {
      return reject(new Error('NO_API_KEY'));
    }

    const prompt = `Actúa como especialista en gestión del riesgo de desastres para familias peruanas ante el fenómeno El Niño y lluvias intensas.
Genera un plan familiar de prevención y evacuación claro, empático y estructurado en pasos concretos.
Datos del hogar:
- Zona / Distrito: ${zone}
- Entorno de vivienda: ${housing}
- Integrantes del hogar: ${members}
- Preocupación principal: ${concern}

Estructura la respuesta en:
1. Rutas y Evacuación Segura
2. Acciones Inmediatas en el Hogar
3. Mochila de Emergencia Priorizada
4. Monitoreo y Canales Oficiales

No inventes falsas órdenes oficiales de evacuación ni niveles de alerta ficticios.`;

    const payload = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Eres un asistente preventivo ante emergencias climáticas en Perú.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            const content = parsed.choices?.[0]?.message?.content;
            resolve(content || 'No se pudo generar el texto.');
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`OpenAI HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/fuentes.html') {
    const filePath = path.join(__dirname, 'fuentes.html');
    if (fs.existsSync(filePath)) {
      return respond(res, 200, fs.readFileSync(filePath, 'utf8'), 'text/html; charset=utf-8');
    }
    return respond(res, 404, 'Archivo fuentes.html no encontrado.');
  }

  if (req.method === 'GET' && req.url === '/health') {
    return respond(
      res,
      200,
      JSON.stringify({ ok: true, aiConfigured: Boolean(OPENAI_API_KEY) }),
      'application/json; charset=utf-8'
    );
  }

  if (req.method === 'POST' && req.url === '/api/plan') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(raw || '{}');
        const { zone = 'Zona no especificada', housing = 'Vivienda estándar', members = 'Familia', concern = 'Inundación' } = body;

        if (OPENAI_API_KEY) {
          try {
            const aiPlan = await callOpenAI(zone, housing, members, concern);
            return respond(
              res,
              200,
              JSON.stringify({ plan: aiPlan, engine: 'IA generativa conectada' }),
              'application/json; charset=utf-8'
            );
          } catch (err) {
            console.error('Error en API OpenAI, usando modo reglas:', err.message);
            const fallbackPlan = generateRuleBasedPlan(zone, housing, members, concern);
            return respond(
              res,
              200,
              JSON.stringify({ plan: fallbackPlan, engine: 'Reglas preventivas (fallback)' }),
              'application/json; charset=utf-8'
            );
          }
        } else {
          const rulePlan = generateRuleBasedPlan(zone, housing, members, concern);
          return respond(
            res,
            200,
            JSON.stringify({ plan: rulePlan, engine: 'Reglas preventivas' }),
            'application/json; charset=utf-8'
          );
        }
      } catch (err) {
        return respond(res, 400, JSON.stringify({ error: 'JSON inválido' }), 'application/json; charset=utf-8');
      }
    });
    return;
  }


  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      return respond(res, 200, fs.readFileSync(indexPath, 'utf8'), 'text/html; charset=utf-8');
    }
    return respond(res, 404, 'Archivo index.html no encontrado.');
  }

  respond(res, 404, 'Ruta no encontrada');
});

server.listen(PORT, () => {
  console.log(`Prototipo en http://localhost:${PORT}`);
});