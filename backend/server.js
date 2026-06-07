const net = require('net');
const http = require('http');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── multer 配置：存到 uploads 目录，使用前端传来的文件名 ───
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    // 优先使用前端传的 name 字段，如果没有则用原始文件名
    const filename = req.body.name || file.originalname;
    cb(null, filename);
  }
});
const upload = multer({ storage, limits: {} });  // 不设限制

// ─── Express HTTP 服务器 ───
const app = express();
app.use(cors());  // 允许跨域

app.post('/api/attement/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, message: '未收到文件' });
  }
  console.log(`[HTTP] 文件已保存: ${req.file.filename} (${req.file.size} bytes)`);
  res.json({ code: 0, message: '上传成功', data: { filename: req.file.filename, size: req.file.size } });
});

// ─── 获取文件列表 ───
app.get('/api/attement/list', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ code: 500, message: '读取文件列表失败' });
    }
    // 获取文件详情
    const fileList = files.map(filename => {
      const filePath = path.join(UPLOAD_DIR, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        mtime: stats.mtime
      };
    });
    res.json({ code: 0, data: fileList });
  });
});

// ─── 下载文件 ───
app.get('/api/attement/download', (req, res) => {
  const filename = req.query.filename;
  if (!filename) {
    return res.status(400).json({ code: 400, message: '缺少 filename 参数' });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ code: 404, message: '文件不存在' });
  }
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error(`[下载错误] ${err.message}`);
      res.status(500).json({ code: 500, message: '下载失败' });
    }
  });
});

// 创建 httpServer 但不独立监听，由 net server 分流调用
const httpServer = http.createServer(app);

// ─── Socket 文件处理 ───
function handleSocketClient(socket) {
  console.log(`[Socket连接] ${socket.remoteAddress}:${socket.remotePort}`);
  let filename = '';
  let filenameLen = -1;
  let fileStream = null;

  socket.on('data', (chunk) => {
    if (filenameLen === -1) {
      if (chunk.length < 4) return;
      filenameLen = chunk.readUInt32BE(0);
      const rest = chunk.slice(4);
      if (rest.length < filenameLen) { filename = rest.toString('utf-8'); return; }
      filename = rest.slice(0, filenameLen).toString('utf-8');
      const after = rest.slice(filenameLen);
      fileStream = fs.createWriteStream(path.join(UPLOAD_DIR, filename));
      console.log(`[Socket接收] 文件名: ${filename}`);
      if (after.length > 0) fileStream.write(after);
      return;
    }
    if (!fileStream) {
      if (chunk.length < filenameLen) { filename += chunk.toString('utf-8'); return; }
      filename = chunk.slice(0, filenameLen).toString('utf-8');
      const after = chunk.slice(filenameLen);
      fileStream = fs.createWriteStream(path.join(UPLOAD_DIR, filename));
      console.log(`[Socket接收] 文件名: ${filename}`);
      if (after.length > 0) fileStream.write(after);
      return;
    }
    if (chunk.length > 0) fileStream.write(chunk);
  });

  socket.on('end', () => {
    if (fileStream) { fileStream.end(); console.log(`[Socket完成] ${filename} 已保存`); }
    filenameLen = -1; filename = ''; fileStream = null;
  });

  socket.on('error', (err) => {
    console.error(`[Socket错误] ${err.message}`);
    if (fileStream) fileStream.destroy();
  });
}

// ─── 共用端口：协议检测分流 ───
const server = net.createServer((socket) => {
  socket.once('data', (chunk) => {
    // 前 4 字节判断协议
    const peek = chunk.slice(0, 4).toString('utf-8');
    if (/^GET|POST|PUT|HEAD/i.test(peek)) {
      // HTTP 请求：推回数据，让 httpServer 接管
      socket.unshift(chunk);
      httpServer.emit('connection', socket);
    } else {
      // Socket 二进制协议
      socket.unshift(chunk);
      handleSocketClient(socket);
    }
  });
});

server.listen(PORT, () => {
  console.log(`混合服务器已启动，端口: ${PORT}`);
  console.log(`  - HTTP (Express):`);
  console.log(`     POST /api/attement/upload`);
  console.log(`     GET /api/attement/list`);
  console.log(`     GET /api/attement/download?filename=xxx`);
  console.log(`  - Socket: 二进制协议 (4B文件名长度 + 文件名 + 内容)`);
  console.log(`文件保存至: ${UPLOAD_DIR}`);
});