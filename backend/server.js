const net = require('net');
const http = require('http');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TEMP_CHUNKS_DIR = path.join(__dirname, 'temp_chunks'); // 临时存储分片的目录

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_CHUNKS_DIR)) {
  fs.mkdirSync(TEMP_CHUNKS_DIR, { recursive: true });
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

const wss = new WebSocket.Server({ server: httpServer });

// 存储每个客户端的连接状态和上传信息
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  console.log(`[WS] Client connected: ${clientId}`);
  
  // 初始化客户端信息
  clients.set(clientId, {
    id: clientId,
    connected: true,
    pendingChunk: null // 存储等待处理的分片元数据
  });

  ws.on('message', (message) => {
    try {
      const clientInfo = clients.get(clientId);
      
      // 处理心跳
      if (message.toString() === 'hello' || message.toString() === 'ping') {
        console.log('[WS] Heartbeat received');
        ws.send(Date.now().toString()); // 响应心跳
        return;
      }

      // 如果消息是字符串，检查是否为JSON格式
      if (Buffer.isBuffer(message)) {
        // 这是二进制数据
        if (clientInfo.pendingChunk) {
          // 使用暂存的元数据处理二进制数据
          const chunkData = clientInfo.pendingChunk;
          const { fileName, chunkIndex, totalChunks, chunkSize } = chunkData;
          
          // 处理二进制数据
          handleChunkData(ws, clientId, fileName, chunkIndex, totalChunks, chunkSize, message);
          
          // 清除待处理的元数据
          clientInfo.pendingChunk = null;
        } else {
          console.log('[WS] Received binary data without metadata, ignoring');
        }
      } else {
        // 这是字符串消息，尝试解析为JSON
        let data;
        try {
          data = JSON.parse(message.toString());
        } catch (e) {
          console.error('[WS] Invalid JSON format:', message.toString());
          return;
        }

        // 处理不同类型的WebSocket消息
        switch (data.type) {
          case 'chunk':
            // 存储分片元数据，等待二进制数据
            clientInfo.pendingChunk = data;
            console.log(`[WS] Received chunk metadata: ${data.fileName}, index: ${data.chunkIndex}`);
            break;
          default:
            console.log(`[WS] Unknown message type: ${data.type}`, data);
        }
      }
    } catch (error) {
      console.error('[WS] Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${clientId}`);
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`[WS] Client error: ${clientId}`, error);
    clients.delete(clientId);
  });
});

// 处理文件分片数据
function handleChunkData(ws, clientId, fileName, chunkIndex, totalChunks, chunkSize, chunkBuffer) {
  console.log(`[WS] Processing chunk ${chunkIndex + 1}/${totalChunks} for file: ${fileName}`);

  // 确保 chunkBuffer 是 Buffer 类型
  if (!(chunkBuffer instanceof Buffer)) {
    chunkBuffer = Buffer.from(chunkBuffer);
  }

  // 创建临时目录存储分片
  const fileDir = path.join(TEMP_CHUNKS_DIR, sanitizeFileName(fileName));
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  // 保存分片
  const chunkPath = path.join(fileDir, `chunk_${chunkIndex}`);
  fs.writeFileSync(chunkPath, chunkBuffer);

  console.log(`[WS] Saved chunk ${chunkIndex} for file ${fileName}`);

  // 检查是否所有分片都已接收
  const receivedChunks = fs.readdirSync(fileDir).length;
  if (receivedChunks === totalChunks) {
    // 合并所有分片
    const finalFilePath = path.join(UPLOAD_DIR, sanitizeFileName(fileName));
    mergeChunks(fileDir, finalFilePath, totalChunks, fileName, ws);
  }

  // 发送确认消息
  ws.send(JSON.stringify({
    type: 'chunkAck',
    chunkIndex,
    fileName,
    receivedChunks,
    totalChunks
  }));
}

// 合并分片
function mergeChunks(chunkDir, finalFilePath, totalChunks, originalFileName, ws) {
  const outputStream = fs.createWriteStream(finalFilePath);
  let chunksProcessed = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(chunkDir, `chunk_${i}`);
    const chunkData = fs.readFileSync(chunkPath);
    outputStream.write(chunkData);
    
    // 删除已处理的分片
    fs.unlinkSync(chunkPath);
  }

  outputStream.end();

  outputStream.on('finish', () => {
    console.log(`[WS] File ${originalFileName} merged successfully`);
    // 删除临时目录
    fs.rmdirSync(chunkDir);
    
    // 发送上传完成确认
    ws.send(JSON.stringify({
      type: 'uploadComplete',
      fileName: originalFileName,
      filePath: finalFilePath
    }));
  });

  outputStream.on('error', (err) => {
    console.error(`[WS] Error merging file ${originalFileName}:`, err);
    ws.send(JSON.stringify({
      type: 'uploadError',
      fileName: originalFileName,
      error: err.message
    }));
  });
}

// 清理文件名，防止路径遍历攻击
function sanitizeFileName(fileName) {
  // 移除潜在危险字符
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
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

// 处理非WebSocket的原始Socket客户端
function handleSocketClient(socket) {
  console.log('[Socket] Raw socket client connected');
  // 这里可以处理非WebSocket的原始套接字连接
  socket.on('data', (data) => {
    console.log('[Socket] Raw data received:', data.length, 'bytes');
  });

  socket.on('close', () => {
    console.log('[Socket] Raw socket client disconnected');
  });

  socket.on('error', (err) => {
    console.error('[Socket] Raw socket error:', err);
  });
}