export default async function handler(request, response) {
    // Configuração de CORS para permitir que o front-end acesse a API
    if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return response.status(204).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Método não permitido' });
    }

    // Chaves de API (Busca automaticamente do .env ou Vercel)
    const publicKey = process.env.VOID_PAYMENTS_PUBLIC_KEY;
    const secretKey = process.env.VOID_PAYMENTS_SECRET_KEY;

    if (!publicKey || !secretKey) {
        return response.status(500).json({ message: 'Credenciais da API não configuradas no servidor' });
    }

    try {
        const body = request.body || {};

        // Validação básica dos dados obrigatórios
        if (!body.identifier || !body.amount || !body.client) {
            return response.status(400).json({ message: 'Dados obrigatórios (identifier, amount, client) estão faltando' });
        }

        // Chamada para a API da VoidPayments
        const voidResponse = await fetch('https://dash.voidpayments.com/api/v1/gateway/pix/receive', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-public-key': publicKey,
                'x-secret-key': secretKey
            },
            body: JSON.stringify(body)
        });

        const data = await voidResponse.json().catch(() => ({
            message: 'A API de pagamentos retornou uma resposta inválida'
        }));

        // Retorna a resposta da VoidPayments diretamente para o front-end
        return response.status(voidResponse.status).json(data);

    } catch (error) {
        console.error('Erro no processamento do PIX:', error);
        return response.status(500).json({ message: 'Erro interno ao processar pagamento' });
    }
}
