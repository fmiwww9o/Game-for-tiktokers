const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let tiktok = null;
let usuarioAtual = null;
let ultimoStatus = { tipo: 'status', texto: 'Aguardando...' };

function enviar(obj) {
  if (obj.tipo === 'status') ultimoStatus = obj;
  const msg = JSON.stringify(obj);
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

function agendar(usuario, conn) {
  setTimeout(() => { if (tiktok === conn) iniciar(usuario); }, 8000);
}

async function iniciar(usuario) {
  const conn = new WebcastPushConnection(usuario);
  tiktok = conn;

  conn.on('follow', d => enviar({ tipo: 'follow', usuario: d.nickname || d.uniqueId }));
  conn.on('gift', d => {
    if (d.giftType === 1 && !d.repeatEnd) return;
    enviar({
      tipo: 'gift',
      usuario: d.nickname || d.uniqueId,
      presente: d.giftName,
      quantidade: d.repeatCount || 1
    });
  });
  conn.on('disconnected', () => {
    enviar({ tipo: 'status', texto: '⚠️ Desconectado. Tentando de novo...' });
    agendar(usuario, conn);
  });

  try {
    await conn.connect();
    enviar({ tipo: 'status', texto: '✅ Conectado na live de @' + usuario });
  } catch (e) {
    enviar({ tipo: 'status', texto: '❌ Não achei a live de @' + usuario + '. Ela está aberta?' });
    agendar(usuario, conn);
  }
}

function conectar(usuario) {
  usuario = String(usuario || '').replace('@', '').trim();
  if (!usuario || usuario === usuarioAtual) return;
  if (tiktok) { try { tiktok.disconnect(); } catch (e) {} }
  usuarioAtual = usuario;
  iniciar(usuario);
}

wss.on('connection', ws => {
  ws.send(JSON.stringify(ultimoStatus));
  ws.on('message', m => {
    try { const d = JSON.parse(m); if (d.user) conectar(d.user); } catch (e) {}
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Rodando na porta ' + PORT));
