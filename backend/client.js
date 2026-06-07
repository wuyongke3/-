const net = require('net');
const fs = require('fs');

const HOST = '127.0.0.1';
const PORT = 3000;

const filePath = process.argv[2];
if (!filePath) {
  console.error('用法: node client.js <文件路径>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(1);
}

const filename = require('path').basename(filePath);
const fileBuffer = fs.readFileSync(filePath);

const client = net.createConnection({ host: HOST, port: PORT }, () => {
  console.log(`[发送] ${filename} (${fileBuffer.length} bytes)`);

  // 协议: 4字节文件名长度 + 文件名 + 文件内容
  const nameBuf = Buffer.from(filename, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(nameBuf.length, 0);

  // 一次性发送（小文件演示；大文件应分片发送）
  client.write(Buffer.concat([header, nameBuf, fileBuffer]));
  client.end();
});

client.on('end', () => {
  console.log('[客户端] 发送完成，连接关闭');
});

client.on('error', (err) => {
  console.error(`[客户端错误] ${err.message}`);
});