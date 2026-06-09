<template>
  <div>
    <button disabled>分片上传</button>
    <p>
      大文件上传过程比较长，而且可能存在用户外部打断的情况，比如用户关闭浏览器、网络中断等
    </p>
    <p>
      为了确保文件上传的完整性和稳定性，建议在上传过程中添加断点续传功能（分片上传）
    </p>
    <input :multiple="isMultiple" type="file" @change="handleFileChange" />
    <span v-if="loading"> 上传中... {{ uploadProgress }}% </span>
    <button :disabled="loading" @click="handleUpload">上传</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { on, off, send, isConnected } from "../utils/socket";

const emit = defineEmits(["afterUploadFinish"]);

const isMultiple = ref(false);
const fileList = ref<File | null>(null);

const loading = ref(false);
const uploadProgress = ref(0);

// 存储WebSocket事件处理函数，用于取消订阅
const socketHandlers = {
  handleMessage: (data: any) => {
    console.log("Received socket message:", data);
    if (data.type === "chunkAck") {
      console.log(`Chunk ${data.chunkIndex} acknowledged by server`);
    } else if (data.type === "uploadComplete") {
      console.log(`File ${data.fileName} uploaded successfully`);
    }
  },
  handleError: (error: any) => {
    console.error("Socket error:", error);
  },
  handleOpen: () => {
    console.log("Socket connection opened");
  },
  handleClose: (event: any) => {
    console.log("Socket connection closed:", event.code, event.reason);
  },
};

// 订阅WebSocket事件
on("message", socketHandlers.handleMessage);
on("error", socketHandlers.handleError);
on("open", socketHandlers.handleOpen);
on("close", socketHandlers.handleClose);

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  fileList.value = target.files?.[0] || null;
};

const handleUpload = async () => {
  if (!fileList.value) return;
  // 上传
  await doUpload(fileList.value);
  // 结束上传
  emit("afterUploadFinish");
};

const doUpload = (file: File) => {
  return new Promise<void>((resolve, reject) => {
    loading.value = true;
    uploadProgress.value = 0;

    const bigfileUploadWorker = new Worker(
      new URL("../worker/test.worker.ts", import.meta.url),
      {
        name: "bigfileUploadWorker",
      },
    );

    bigfileUploadWorker.postMessage({ attachment: file });

    bigfileUploadWorker.onmessage = (ev) => {
      const {
        type,
        fileName,
        progress,
        chunkIndex,
        totalChunks,
        chunkData,
        message,
      } = ev.data;

      switch (type) {
        case "chunkingStart":
          console.log(
            `开始处理文件分片: ${fileName}, 总分片数: ${totalChunks}`,
          );
          break;

        case "chunkReady":
          // 更新进度
          uploadProgress.value = Math.round(progress);
          console.log(
            `分片 ${chunkIndex + 1}/${totalChunks} 准备就绪, 进度: ${progress}%`,
          );

          // 通过Socket发送分片（如果连接可用）
          if (isConnected()) {
            try {
              // 发送分片数据
              const chunkPacket = {
                type: "chunk",
                fileName,
                chunkIndex,
                totalChunks,
                chunkSize: chunkData.byteLength,
              };

              // 发送元数据
              send(JSON.stringify(chunkPacket));
              // 然后发送二进制数据
              send(chunkData);
              console.log(`分片 ${chunkIndex} 已发送`);
            } catch (err) {
              console.error("Failed to send chunk via socket:", err);
            }
          } else {
            console.warn("Socket not connected, cannot send chunk");
          }
          break;

        case "chunkingComplete":
          console.log(`文件 ${fileName} 的 ${totalChunks} 个分片全部处理完毕`);
          loading.value = false;
          resolve();
          break;

        case "error":
          console.error("处理分片时出错:", message);
          loading.value = false;
          reject(new Error(message));
          break;

        default:
          console.log("Worker消息:", ev.data);
      }
    };

    bigfileUploadWorker.onerror = (error) => {
      console.error("Worker错误:", error);
      loading.value = false;
      reject(error);
    };
  });
};
</script>