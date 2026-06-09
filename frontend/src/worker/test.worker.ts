// 定义分片大小为16MB
const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB

onmessage = (e) => {
  const { attachment } = e.data;

  const { name: fileName, size: fileSize } = attachment;

  // 计算分片总数
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  console.log(
    `开始分片处理: ${fileName}, 总大小: ${fileSize} bytes, 总分片数: ${totalChunks}`,
  );

  // 发送开始分片的消息
  postMessage({
    type: "chunkingStart",
    fileName,
    fileSize,
    totalChunks,
  });

  // 开始分片处理
  processChunk(attachment, fileName, totalChunks, 0);
};

// 递归处理单个分片
function processChunk(
  file: File,
  fileName: string,
  totalChunks: number,
  currentChunk: number,
) {
  // 如果当前分片数大于等于总分片数，则结束分片处理
  if (currentChunk >= totalChunks) {
    // 发送完成，返回信息
    postMessage({
      type: "chunkingComplete",
      fileName,
      totalChunks,
      message: "所有分片处理完毕"
    });
    return;
  }

  // 计算当前分片的起始和结束位置
  const start = currentChunk * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);
  const chunk = file.slice(start, end);

  // 为每个分片创建新的FileReader实例
  const reader = new FileReader();

  reader.onload = (evt: ProgressEvent<FileReader>) => {
    const arrayBuffer = evt.target?.result as ArrayBuffer;

    // 发送单个分片数据到主线程
    postMessage({
      type: "chunkReady",
      fileName,
      chunkIndex: currentChunk,
      chunkData: arrayBuffer,
      totalChunks,
      progress: ((currentChunk + 1) / totalChunks) * 100,
    }, [arrayBuffer]); // 使用Transferable API转移ArrayBuffer所有权

    // 处理下一个分片
    processChunk(file, fileName, totalChunks, currentChunk + 1);
  };

  reader.onerror = (error) => {
    console.error("读取分片失败:", error);
    postMessage({
      type: "error",
      message: `读取分片${currentChunk}失败`,
      error,
    });
  };

  reader.onloadend = (res) => {
    console.log(`分片 ${currentChunk} 读取完毕`, res);
  };

  reader.readAsArrayBuffer(chunk);
}
