const VOID_PAYMENTS_URL =
  'https://dash.voidpayments.com/api/v1/gateway/pix/receive';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function sendJson(res, statusCode, body) {
  res.status(statusCode).json(body);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'O corpo da requisição deve ser um objeto JSON.';
  }

  if (!isNonEmptyString(body.identifier)) {
    return 'identifier deve ser uma string não vazia.';
  }

  if (
    typeof body.amount !== 'number' ||
    !Number.isFinite(body.amount) ||
    body.amount <= 0
  ) {
    return 'amount deve ser um número positivo.';
  }

  if (!body.client || typeof body.client !== 'object' || Array.isArray(body.client)) {
    return 'client deve ser um objeto.';
  }

  const requiredClientFields = ['name', 'email', 'phone', 'document'];
  const missingField = requiredClientFields.find(
    (field) => !isNonEmptyString(body.client[field])
  );

  if (missingField) {
    return `client.${missingField} deve ser uma string não vazia.`;
  }

  return null;
}

function getErrorMessage(payload, fallback) {
  if (payload && typeof payload === 'object') {
    if (isNonEmptyString(payload.message)) return payload.message;
    if (isNonEmptyString(payload.error)) return payload.error;
  }

  return fallback;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  const validationError = validatePayload(req.body);
  if (validationError) {
    return sendJson(res, 400, { error: validationError });
  }

  const publicKey = process.env.VOID_PAYMENTS_PUBLIC_KEY;
  const secretKey = process.env.VOID_PAYMENTS_SECRET_KEY;

  if (!publicKey || !secretKey) {
    console.error('Credenciais da VoidPayments não configuradas.');
    return sendJson(res, 500, { error: 'Serviço de pagamento indisponível.' });
  }

  const payload = {
    identifier: req.body.identifier.trim(),
    amount: req.body.amount,
    client: {
      name: req.body.client.name.trim(),
      email: req.body.client.email.trim(),
      phone: req.body.client.phone.trim(),
      document: req.body.client.document.trim(),
    },
  };

  try {
    const upstreamResponse = await fetch(VOID_PAYMENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': publicKey,
        'x-secret-key': secretKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await upstreamResponse.text();
    let responseBody = null;

    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = null;
    }

    if (upstreamResponse.status === 400) {
      return sendJson(res, 400, {
        error: getErrorMessage(responseBody, 'Dados rejeitados pela VoidPayments.'),
      });
    }

    if (upstreamResponse.status >= 500) {
      console.error('Erro da VoidPayments:', upstreamResponse.status);
      return sendJson(res, 502, {
        error: 'A VoidPayments está indisponível no momento.',
      });
    }

    if (!upstreamResponse.ok) {
      console.error('Resposta inesperada da VoidPayments:', upstreamResponse.status);
      return sendJson(res, 502, {
        error: 'Não foi possível processar o pagamento.',
      });
    }

    const pix = responseBody && responseBody.pix;
    if (!pix || !isNonEmptyString(pix.code) || !isNonEmptyString(pix.image)) {
      console.error('Resposta da VoidPayments sem dados PIX esperados.');
      return sendJson(res, 502, {
        error: 'Resposta inválida do serviço de pagamento.',
      });
    }

    return sendJson(res, 200, {
      pix: {
        code: pix.code,
        image: pix.image,
      },
    });
  } catch (error) {
    console.error('Falha ao chamar a VoidPayments:', error);
    return sendJson(res, 502, {
      error: 'Não foi possível conectar ao serviço de pagamento.',
    });
  }
}
